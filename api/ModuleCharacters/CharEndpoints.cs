using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
///   GET api/char/mine                 logged in — the user's tracked characters and their worlds
///   GET api/char/players/{userId}     anyone — the same for one player (characters are public)
///   PUT api/char/worlds/{id}/seed     logged in — name a world's seed when it couldn't be worked out
/// </summary>
public static class CharEndpoints
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/char");
        api.MapGet("mine", Mine).RequireAuthorization();
        api.MapGet("players/{userId:int}", OfPlayer);
        api.MapPut("worlds/{id:long}/seed", PutSeed).RequireAuthorization();
    }

    static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record WorldItem(long Id, long Uid, string? Name, string? Seed, bool NeedsSeed);
    public record CharacterItem(long Id, string Name, DateTime LatestFileTime, int Snapshots, int Sessions,
        float PlaySeconds, WorldItem[] Worlds, LatestOut? Latest);

    /// <summary>
    /// The character at its latest save, as the game's inventory screen shows it.
    /// WorldId: the world it was played in (else the most explored one); Explored:
    /// explored cells there (12 m each); X/Z: its logout point there.
    /// </summary>
    /// InventoryRows: rows of the inventory the player has (4, more with the traders' pocket upgrades).
    public record LatestOut(long SnapshotId, long? WorldId, int? Explored, float? X, float? Z,
        float Health, float MaxHealth, float Stamina, float MaxStamina, float Eitr, float MaxEitr,
        string? GuardianPower, FoodOut[] Foods, ItemOut[] Items, int InventoryRows);
    public record FoodOut(string Name, float Time);
    /// <summary>Name for older saves; 1.0 saves have only the prefab's StableHash.</summary>
    public record ItemOut(string? Name, int PrefabHash, int Stack, int Quality, int GridX, int GridY, bool Equipped);

    public static Task<Ok<CharacterItem[]>> Mine(ClaimsPrincipal user, AppDbContext db) => List(UserId(user), db);

    public static Task<Ok<CharacterItem[]>> OfPlayer(int userId, AppDbContext db) => List(userId, db);

    static async Task<Ok<CharacterItem[]>> List(int userId, AppDbContext db)
    {
        var chars = await db.Set<Character>().AsNoTracking()
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.LatestFileTime)
            .Select(c => new
            {
                c.Id, c.Name, c.LatestFileTime,
                Snapshots = db.Set<CharSnapshot>().Count(s => s.CharacterId == c.Id),
                Sessions = db.Set<CharSnapshot>().Where(s => s.CharacterId == c.Id).Max(s => (int?)s.Session) ?? 0,
                Play = db.Set<CharSnapshot>().Where(s => s.CharacterId == c.Id)
                    .OrderByDescending(s => s.FileTime).Select(s => s.AxisSeconds).FirstOrDefault(),
                WorldIds = db.Set<CharMapTile>()
                    .Where(t => db.Set<CharSnapshot>().Any(s => s.Id == t.SnapshotId && s.CharacterId == c.Id))
                    .Select(t => t.WorldId).Distinct().ToList(),
            })
            .ToListAsync();

        var worldIds = chars.SelectMany(c => c.WorldIds).Distinct().ToList();
        var worlds = await db.Set<CharWorld>().AsNoTracking().Where(w => worldIds.Contains(w.Id)).ToDictionaryAsync(w => w.Id);
        var ids = chars.Select(c => c.Id).ToList();
        var latest = await db.Set<CharSnapshot>().AsNoTracking()
            .Where(s => ids.Contains(s.CharacterId))
            .GroupBy(s => s.CharacterId)
            .Select(g => g.OrderByDescending(s => s.FileTime).First())
            .ToDictionaryAsync(s => s.CharacterId);
        var byUid = worlds.Values.ToDictionary(w => w.Uid, w => w.Id);
        var items = chars.Select(c => new CharacterItem(c.Id, c.Name, c.LatestFileTime, c.Snapshots, c.Sessions, c.Play,
            c.WorldIds.Select(id => worlds[id]).Select(w => new WorldItem(w.Id, w.Uid, w.Name, w.Seed, w.Seed == null)).ToArray(),
            latest.TryGetValue(c.Id, out var snap) ? Latest(snap, byUid) : null))
            .ToArray();
        return TypedResults.Ok(items);
    }

    internal static LatestOut Latest(CharSnapshot snap, Dictionary<long, long> worldIdByUid)
    {
        using var doc = JsonDocument.Parse(snap.Data);
        var root = doc.RootElement;
        static float F(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetSingle() : 0;

        // The world it was in: the one the save was made in, else the most explored.
        JsonElement? world = null;
        foreach (var w in root.GetProperty("worlds").EnumerateArray())
        {
            if (!worldIdByUid.TryGetValue(w.GetProperty("uid").GetInt64(), out var wid)) continue;
            if (wid == snap.WorldId) { world = w; break; }
            if (world == null || w.GetProperty("explored").GetInt32() > world.Value.GetProperty("explored").GetInt32()) world = w;
        }
        long? worldId = world is { } we ? worldIdByUid[we.GetProperty("uid").GetInt64()] : null;
        float? x = null, z = null;
        if (world is { } wl && wl.TryGetProperty("logout", out var logout) && logout.ValueKind == JsonValueKind.Object)
            (x, z) = (F(logout, "x"), F(logout, "z"));

        var p = root.TryGetProperty("player", out var pl) ? pl : default;
        var foods = p.ValueKind == JsonValueKind.Object
            ? p.GetProperty("foods").EnumerateArray().Select(f => new FoodOut(f.GetProperty("name").GetString() ?? "", F(f, "time"))).ToArray()
            : [];
        var inv = p.ValueKind == JsonValueKind.Object
            ? p.GetProperty("inventory").GetProperty("items").EnumerateArray().Select(i => new ItemOut(
                i.TryGetProperty("name", out var n) ? n.GetString() : null, i.GetProperty("prefabHash").GetInt32(),
                i.GetProperty("stack").GetInt32(), i.GetProperty("quality").GetInt32(),
                i.GetProperty("gridX").GetInt32(), i.GetProperty("gridY").GetInt32(), i.GetProperty("equipped").GetBoolean())).ToArray()
            : [];
        // Player.SetInventorySize keeps the rows as the unique key "invrows N" (absent before 1.0: 4).
        int rows = 4;
        if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("uniques", out var uniques))
            foreach (var u in uniques.EnumerateArray())
            {
                var parts = (u.GetString() ?? "").Split(' ');
                if (parts.Length >= 2 && parts[0].Equals("invrows", StringComparison.OrdinalIgnoreCase)
                    && int.TryParse(parts[1], out var n)) rows = Math.Clamp(n, 0, 9);
            }
        return new LatestOut(snap.Id, worldId, world?.GetProperty("explored").GetInt32(), x, z,
            F(p, "health"), F(p, "maxHealth"), F(p, "stamina"), F(p, "maxStamina"), F(p, "eitr"), F(p, "maxEitr"),
            p.ValueKind == JsonValueKind.Object && p.TryGetProperty("guardianPower", out var gp) ? gp.GetString() : null,
            foods, inv, rows);
    }

    public record SeedReq(string Seed);

    public static async Task<Results<Ok<WorldItem>, NotFound, BadRequest<string>, Conflict<string>>> PutSeed(
        long id, SeedReq req, ClaimsPrincipal user, AppDbContext db, IConfiguration config, IHttpClientFactory httpFactory)
    {
        var userId = UserId(user);
        var seed = (req.Seed ?? "").Trim();
        if (seed.Length == 0 || seed.Length > 64) return TypedResults.BadRequest("Invalid seed");

        // Only someone whose character has explored this world may name it.
        bool mine = await db.Set<CharMapTile>().AnyAsync(t => t.WorldId == id &&
            db.Set<CharSnapshot>().Any(s => s.Id == t.SnapshotId &&
                db.Set<Character>().Any(c => c.Id == s.CharacterId && c.UserId == userId)));
        var world = mine ? await db.Set<CharWorld>().SingleOrDefaultAsync(w => w.Id == id) : null;
        if (world == null) return TypedResults.NotFound();
        if (world.Seed != null) return TypedResults.Conflict("This world's seed is already known");
        // The 1.0 minimap cache gives the seed's hash for server worlds; hold the answer to it.
        if (world.SeedHash is { } h && WorldFile.StableHash(seed) != h)
            return TypedResults.BadRequest("That seed doesn't match this world");

        world.Seed = seed;
        world.SeedHash = WorldFile.StableHash(seed);
        await CharSeeds.Generate(db, userId, [world], config, httpFactory);
        await db.SaveChangesAsync();
        return TypedResults.Ok(new WorldItem(world.Id, world.Uid, world.Name, world.Seed, false));
    }
}
