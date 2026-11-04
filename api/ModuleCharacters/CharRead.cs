using System.IO.Compression;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleWorlds;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
/// What the tracking page reads (characters are public):
///
///   GET api/char/{id}                                   the character, its worlds and its save timeline
///   GET api/char/{id}/worlds/{worldId}/tiles            every fog tile the character's saves changed (binary, below)
///   GET api/char/{id}/snapshots/{sid}/worlds/{worldId}  that world's pins and points at one save
///   GET api/char/{id}/snapshots/{sid}/player            the character at one save (vitals, food, inventory)
///   GET api/char/worlds/{worldId}/map                   whether the world's map is generated yet
///
/// Tiles: "VHT1", int32 count, then per tile (oldest save first) int64 snapshot id,
/// int16 tile index, byte 1 if explored-by-others follows, 512 bytes explored and
/// maybe 512 bytes explored-by-others. A tile is 64 x 64 cells of the 2048 x 2048
/// fog, 8 bytes a row, LSB first (see Vh.Character SaveDiff.ChangedTiles). Applying
/// the tiles of every save up to one gives the fog at that save.
/// </summary>
public static class CharRead
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/char");
        api.MapGet("{id:long}", Get);
        api.MapGet("{id:long}/worlds/{worldId:long}/tiles", Tiles);
        api.MapGet("{id:long}/snapshots/{sid:long}/worlds/{worldId:long}", SnapshotWorld);
        api.MapGet("{id:long}/snapshots/{sid:long}/player", SnapshotPlayer);
        api.MapGet("worlds/{worldId:long}/map", MapStatus);
    }

    static int? UserId(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public record Owner(int Id, string Username, string AvatarUrl);
    public record WorldItem(long Id, long Uid, string? Name, string? Seed, bool NeedsSeed, bool ViewerPlays);
    /// <summary>One save. X/Z: the logout point in the world the save was made in; Explored: its explored cells.</summary>
    public record SnapshotItem(long Id, DateTime FileTime, int Session, float Axis, bool Rewind, long? WorldId,
        float? X, float? Z, int? Explored, double? WorldSeconds);
    public record CharacterResp(long Id, string Name, Owner Owner, bool IsMine, WorldItem[] Worlds, SnapshotItem[] Snapshots,
        CharEndpoints.LatestOut? Latest);

    public static async Task<Results<Ok<CharacterResp>, NotFound>> Get(long id, ClaimsPrincipal user, AppDbContext db)
    {
        var c = await db.Set<Character>().AsNoTracking().Where(c => c.Id == id)
            .Select(c => new { c.Id, c.Name, c.UserId }).SingleOrDefaultAsync();
        if (c == null) return TypedResults.NotFound();
        var owner = await db.Users.AsNoTracking().Where(u => u.Id == c.UserId)
            .Select(u => new Owner(u.Id, u.Username, u.AvatarUrl)).SingleAsync();

        var snapshots = await db.Database.SqlQuery<SnapshotItem>($"""
            SELECT s.id, s.file_time, s.session, s.axis_seconds AS axis, s.rewind, s.world_id,
                   (w.e->'logout'->>'x')::real AS x, (w.e->'logout'->>'z')::real AS z,
                   (w.e->>'explored')::int AS explored, s.world_seconds
            FROM char_snapshots s
            LEFT JOIN char_worlds cw ON cw.id = s.world_id
            LEFT JOIN LATERAL (
                SELECT e FROM jsonb_array_elements(s.data->'worlds') e
                WHERE (e->>'uid')::bigint = cw.uid LIMIT 1) w ON true
            WHERE s.character_id = {id}
            ORDER BY s.id
            """).ToArrayAsync();

        var worldIds = await WorldIdsOf(db, [id]);
        var viewer = UserId(user);
        var viewerWorlds = new HashSet<long>();
        if (viewer is { } v)
        {
            var mine = await db.Set<Character>().AsNoTracking().Where(x => x.UserId == v).Select(x => x.Id).ToListAsync();
            viewerWorlds = (await WorldIdsOf(db, mine)).ToHashSet();
        }
        var worlds = await db.Set<CharWorld>().AsNoTracking().Where(w => worldIds.Contains(w.Id)).ToListAsync();
        // Most recently played first.
        var lastPlayed = snapshots.Where(s => s.WorldId != null).GroupBy(s => s.WorldId!.Value)
            .ToDictionary(g => g.Key, g => g.Max(s => s.Id));
        var items = worlds.OrderByDescending(w => lastPlayed.GetValueOrDefault(w.Id))
            .Select(w => new WorldItem(w.Id, w.Uid, w.Name, w.Seed, w.Seed == null, viewerWorlds.Contains(w.Id)))
            .ToArray();
        var last = await db.Set<CharSnapshot>().AsNoTracking().Where(s => s.CharacterId == id)
            .OrderByDescending(s => s.FileTime).FirstOrDefaultAsync();
        var latest = last == null ? null : CharEndpoints.Latest(last, worlds.ToDictionary(w => w.Uid, w => w.Id));
        return TypedResults.Ok(new CharacterResp(c.Id, c.Name, owner, viewer == c.UserId, items, snapshots, latest));
    }

    /// <summary>Worlds the characters have fog in.</summary>
    static async Task<List<long>> WorldIdsOf(AppDbContext db, List<long> characterIds) =>
        await db.Set<CharMapTile>().AsNoTracking()
            .Where(t => db.Set<CharSnapshot>().Any(s => s.Id == t.SnapshotId && characterIds.Contains(s.CharacterId)))
            .Select(t => t.WorldId).Distinct().ToListAsync();

    public static async Task Tiles(long id, long worldId, HttpContext ctx, AppDbContext db)
    {
        var tiles = await db.Set<CharMapTile>().AsNoTracking()
            .Where(t => t.WorldId == worldId && db.Set<CharSnapshot>().Any(s => s.Id == t.SnapshotId && s.CharacterId == id))
            .OrderBy(t => t.SnapshotId).ThenBy(t => t.Tile)
            .Select(t => new { t.SnapshotId, t.Tile, t.Explored, t.Others })
            .ToListAsync(ctx.RequestAborted);

        ctx.Response.ContentType = "application/octet-stream";
        ctx.Response.Headers.CacheControl = "no-cache";
        Stream body = ctx.Response.Body;
        GZipStream? gz = null;
        if (ctx.Request.Headers.AcceptEncoding.ToString().Contains("gzip"))
        {
            ctx.Response.Headers.ContentEncoding = "gzip";
            body = gz = new GZipStream(body, CompressionLevel.Fastest, leaveOpen: true);
        }
        var ms = new MemoryStream();
        using (var w = new BinaryWriter(ms, System.Text.Encoding.ASCII, leaveOpen: true))
        {
            w.Write("VHT1"u8);
            w.Write(tiles.Count);
            foreach (var t in tiles)
            {
                w.Write(t.SnapshotId);
                w.Write(t.Tile);
                w.Write((byte)(t.Others != null ? 1 : 0));
                w.Write(t.Explored);
                if (t.Others != null) w.Write(t.Others);
            }
        }
        ms.Position = 0;
        await ms.CopyToAsync(body, ctx.RequestAborted);
        if (gz != null) await gz.DisposeAsync();
    }

    /// <summary>The world's entry of one save, as stored (uid, spawn, logout, death, home, explored, pins...).</summary>
    public static async Task<IResult> SnapshotWorld(long id, long sid, long worldId, AppDbContext db)
    {
        var json = await db.Database.SqlQuery<string>($"""
            SELECT e::text AS "Value"
            FROM char_snapshots s
            JOIN char_worlds cw ON cw.id = {worldId}
            CROSS JOIN LATERAL jsonb_array_elements(s.data->'worlds') e
            WHERE s.id = {sid} AND s.character_id = {id} AND (e->>'uid')::bigint = cw.uid
            LIMIT 1
            """).ToListAsync();
        return json.Count == 0 ? Results.NotFound() : Results.Text(json[0], "application/json");
    }

    public static async Task<Results<Ok<CharEndpoints.LatestOut>, NotFound>> SnapshotPlayer(long id, long sid, AppDbContext db)
    {
        var snap = await db.Set<CharSnapshot>().AsNoTracking().SingleOrDefaultAsync(s => s.Id == sid && s.CharacterId == id);
        if (snap == null) return TypedResults.NotFound();
        var worldIds = await WorldIdsOf(db, [id]);
        var byUid = await db.Set<CharWorld>().AsNoTracking().Where(w => worldIds.Contains(w.Id)).ToDictionaryAsync(w => w.Uid, w => w.Id);
        return TypedResults.Ok(CharEndpoints.Latest(snap, byUid));
    }

    /// <summary>"noSeed" (ask for it), "notQueued" (over the daily allowance so far), else seedgen's status.</summary>
    public record MapResp(string Status, string? Seed, string? EstWait, string? Error);

    public static async Task<Results<Ok<MapResp>, NotFound>> MapStatus(long worldId, ClaimsPrincipal user,
        AppDbContext db, IConfiguration config, IHttpClientFactory httpFactory)
    {
        var w = await db.Set<CharWorld>().SingleOrDefaultAsync(w => w.Id == worldId);
        if (w == null) return TypedResults.NotFound();
        if (w.Seed == null) return TypedResults.Ok(new MapResp("noSeed", null, null, null));
        if (w.SeedgenAt == null && UserId(user) is { } viewer)
        {
            // Held back by the daily allowance at upload: one of its players looking retries.
            var mine = await db.Set<Character>().AsNoTracking().Where(c => c.UserId == viewer).Select(c => c.Id).ToListAsync();
            if ((await WorldIdsOf(db, mine)).Contains(worldId))
            {
                await CharSeeds.Generate(db, viewer, [w], config, httpFactory);
                await db.SaveChangesAsync();
            }
        }
        if (w.SeedgenAt == null) return TypedResults.Ok(new MapResp("notQueued", w.Seed, null, null));
        var s = await WorldsEndpoints.SubmitToSeedGen(config, httpFactory, w.Seed);
        return TypedResults.Ok(new MapResp(s.Status, w.Seed, s.EstWait, s.Error));
    }
}
