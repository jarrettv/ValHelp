using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
///   GET api/char/mine                 logged in — the user's tracked characters and their worlds
///   PUT api/char/worlds/{id}/seed     logged in — name a world's seed when it couldn't be worked out
/// </summary>
public static class CharEndpoints
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/char");
        api.MapGet("mine", Mine).RequireAuthorization();
        api.MapPut("worlds/{id:long}/seed", PutSeed).RequireAuthorization();
    }

    static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record WorldItem(long Id, long Uid, string? Name, string? Seed, bool NeedsSeed);
    public record CharacterItem(long Id, string Name, DateTime LatestFileTime, int Snapshots, int Sessions,
        float PlaySeconds, WorldItem[] Worlds);

    public static async Task<Ok<CharacterItem[]>> Mine(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
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
        var items = chars.Select(c => new CharacterItem(c.Id, c.Name, c.LatestFileTime, c.Snapshots, c.Sessions, c.Play,
            c.WorldIds.Select(id => worlds[id]).Select(w => new WorldItem(w.Id, w.Uid, w.Name, w.Seed, w.Seed == null)).ToArray()))
            .ToArray();
        return TypedResults.Ok(items);
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
