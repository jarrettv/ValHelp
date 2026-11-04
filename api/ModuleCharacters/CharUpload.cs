using System.IO.Compression;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
///   POST api/char/upload    watcher (bearer token) — one character save
///
/// multipart/form-data:
///   file      the .fch, gzipped
///   fileTime  when the game wrote it (ISO 8601), i.e. the file's mtime
///   fwl       0..n world files (.fwl or _main.N.fwl2) from worlds_local
///   meta      0..n worlds_local/&lt;name&gt;/cacheMinimapMeta, the part's file name = &lt;name&gt;
///
/// The watcher sends a save only when its content changed; a save identical to
/// the character's latest, or older than it, is acknowledged without storing.
/// </summary>
public static class CharUpload
{
    const long MaxGzipped = 4 << 20;
    const long MaxRaw = 32 << 20;
    const int MaxSmallFile = 64 << 10;

    internal static void Map(WebApplication app)
    {
        app.MapPost("api/char/upload", Upload).DisableAntiforgery();
    }

    public record WorldOut(long Id, long Uid, string? Name, string? Seed, bool NeedsSeed);
    public record UploadResp(string Status, long CharacterId, long? SnapshotId, int? Session, WorldOut[] Worlds);

    public static async Task<IResult> Upload(HttpContext ctx, AppDbContext db, IConfiguration config,
        IHttpClientFactory httpFactory, ILogger<CharDevice> logger)
    {
        var device = await CharDevices.Authenticate(ctx, db);
        if (device == null) return Results.Unauthorized();
        if (!ctx.Request.HasFormContentType) return Results.BadRequest("multipart/form-data expected");

        var form = await ctx.Request.ReadFormAsync();
        var file = form.Files.GetFile("file");
        if (file == null || file.Length == 0 || file.Length > MaxGzipped) return Results.BadRequest("file missing or too large");
        if (!DateTimeOffset.TryParse(form["fileTime"], out var fileTimeOffset)) return Results.BadRequest("fileTime missing");
        var fileTime = fileTimeOffset.UtcDateTime;

        byte[] gz;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            gz = ms.ToArray();
        }
        byte[] raw;
        CharacterProfile profile;
        try
        {
            raw = Gunzip(gz, MaxRaw);
            profile = CharacterFile.Parse(raw);
        }
        catch (Exception ex) when (ex is InvalidDataException or EndOfStreamException or IOException)
        {
            logger.LogWarning(ex, "Unreadable character upload from device {Device}", device.Id);
            return Results.BadRequest($"Not a readable character file: {ex.Message}");
        }
        var hints = ReadHints(form, logger);
        var hash = Convert.ToHexStringLower(SHA256.HashData(raw));
        var now = DateTime.UtcNow;

        var character = await db.Set<Character>()
            .SingleOrDefaultAsync(c => c.UserId == device.UserId && c.PlayerId == profile.PlayerId);
        if (character != null && (character.LatestHash == hash || fileTime <= character.LatestFileTime))
        {
            await db.SaveChangesAsync(); // device.LastSeenAt
            var status = character.LatestHash == hash ? "unchanged" : "stale";
            return Results.Ok(new UploadResp(status, character.Id, null, null,
                await WorldsOut(db, profile.Worlds.Select(w => w.WorldUid))));
        }

        CharacterProfile? prev = null;
        CharSnapshot? prevSnap = null;
        if (character != null)
        {
            prev = CharacterFile.Parse(Gunzip(character.LatestRaw, MaxRaw));
            prevSnap = await db.Set<CharSnapshot>().AsNoTracking()
                .Where(s => s.CharacterId == character.Id)
                .OrderByDescending(s => s.FileTime).FirstOrDefaultAsync();
        }
        else
        {
            character = new Character { UserId = device.UserId, PlayerId = profile.PlayerId, CreatedAt = now };
            db.Add(character);
        }
        character.Name = profile.Name;
        character.UpdatedAt = now;
        character.LatestHash = hash;
        character.LatestFileTime = fileTime;
        character.LatestRaw = gz;

        // World rows for every world the character knows (shared across characters).
        var uids = profile.Worlds.Select(w => w.WorldUid).ToList();
        var worlds = await db.Set<CharWorld>().Where(w => uids.Contains(w.Uid)).ToDictionaryAsync(w => w.Uid);
        foreach (var uid in uids.Where(u => !worlds.ContainsKey(u)))
        {
            var w = new CharWorld { Uid = uid, CreatedAt = now };
            db.Add(w);
            worlds[uid] = w;
        }
        if (worlds.Values.Any(w => w.Seed == null))
            CharSeeds.Resolve(prev, profile, worlds, hints, await CharSeeds.KnownSeeds(db));
        await db.SaveChangesAsync(); // ids for character and worlds

        float play = SaveDiff.PlaySeconds(profile);
        var timing = SaveDiff.Place(fileTime, play, prevSnap?.FileTime, prevSnap?.Session ?? 0,
            prevSnap?.PlaySeconds ?? 0, prevSnap?.AxisSeconds ?? 0);
        var activeUid = SaveDiff.ActiveWorld(prev, profile);
        var snap = new CharSnapshot
        {
            CharacterId = character.Id,
            FileTime = fileTime,
            UploadedAt = now,
            Hash = hash,
            Session = timing.Session,
            PlaySeconds = play,
            AxisSeconds = timing.AxisSeconds,
            Rewind = timing.Rewind,
            WorldId = activeUid is { } a ? worlds[a].Id : null,
            Data = CharSnapshotJson.ToJson(profile),
        };
        db.Add(snap);
        await db.SaveChangesAsync();

        foreach (var w in profile.Worlds.Where(w => w.Map != null))
        {
            var old = prev?.Worlds.FirstOrDefault(o => o.WorldUid == w.WorldUid)?.Map;
            foreach (var t in SaveDiff.ChangedTiles(old, w.Map!))
                db.Add(new CharMapTile
                {
                    SnapshotId = snap.Id, WorldId = worlds[w.WorldUid].Id, Tile = t.Index,
                    Explored = t.Explored, Others = t.Others,
                });
        }
        await CharSeeds.Generate(db, device.UserId, worlds.Values, config, httpFactory);
        await db.SaveChangesAsync();

        return Results.Ok(new UploadResp("stored", character.Id, snap.Id, snap.Session,
            worlds.Values.Select(Out).ToArray()));
    }

    static WorldOut Out(CharWorld w) => new(w.Id, w.Uid, w.Name, w.Seed, w.Seed == null);

    static async Task<WorldOut[]> WorldsOut(AppDbContext db, IEnumerable<long> uids)
    {
        var list = uids.ToList();
        var worlds = await db.Set<CharWorld>().AsNoTracking().Where(w => list.Contains(w.Uid)).ToListAsync();
        return worlds.Select(Out).ToArray();
    }

    static CharSeeds.Hints ReadHints(IFormCollection form, ILogger logger)
    {
        var fwls = new List<WorldMeta>();
        var metas = new Dictionary<string, int>();
        foreach (var f in form.Files)
        {
            if (f.Length == 0 || f.Length > MaxSmallFile) continue;
            var bytes = new byte[f.Length];
            using (var s = f.OpenReadStream()) s.ReadExactly(bytes);
            try
            {
                if (f.Name == "fwl") fwls.Add(WorldFile.Parse(bytes));
                else if (f.Name == "meta" && bytes.Length >= 8) metas[f.FileName] = WorldFile.ParseMinimapMeta(bytes).Seed;
            }
            catch (Exception ex) when (ex is InvalidDataException or EndOfStreamException)
            {
                logger.LogInformation("Skipping unreadable world hint {Name}: {Error}", f.FileName, ex.Message);
            }
        }
        return new CharSeeds.Hints(fwls, metas);
    }

    static byte[] Gunzip(byte[] gz, long max)
    {
        using var input = new GZipStream(new MemoryStream(gz), CompressionMode.Decompress);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        int n;
        while ((n = input.Read(buffer)) > 0)
        {
            if (output.Length + n > max) throw new InvalidDataException("character file too large");
            output.Write(buffer, 0, n);
        }
        return output.ToArray();
    }
}
