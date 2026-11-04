using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleWorlds;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
/// Ties a world UID from a character save to a seed, from what the watcher sends
/// along with each upload:
///   - local worlds: the .fwl / _main.N.fwl2 with the same UID names the seed outright;
///   - server worlds (no .fwl): the world's name is found from the character's
///     KnownWorlds (play time per world name), and the 1.0 minimap cache
///     worlds_local/&lt;name&gt;/cacheMinimapMeta gives the seed's hash. The seed is
///     the name when the hashes agree (hunt worlds), else any seed we already know
///     with that hash; failing both, the site asks the player (PUT .../seed).
/// Once a seed is known its map is generated, within a daily allowance per user.
/// </summary>
public static class CharSeeds
{
    /// <summary>New seeds a user's tracked worlds may queue for generation per day.</summary>
    public const int SeedgenPerDay = 5;

    /// <summary>ClockByName: world clock (seconds) by world name, as of the uploaded save.</summary>
    public record Hints(List<WorldMeta> Fwls, Dictionary<string, int> SeedHashByName, Dictionary<string, double> ClockByName);

    public static void Resolve(CharacterProfile? prev, CharacterProfile cur, Dictionary<long, CharWorld> worlds,
        Hints hints, Func<int, string?> knownSeed)
    {
        foreach (var w in worlds.Values.Where(w => w.Seed == null))
        {
            var fwl = hints.Fwls.FirstOrDefault(f => f.Uid == w.Uid);
            if (fwl != null)
            {
                w.Name ??= fwl.Name;
                w.Seed = fwl.SeedName;
                w.SeedHash = fwl.Seed;
            }
        }

        // Name the server worlds. KnownWorlds names that no local .fwl or
        // already-named world claims belong to the unnamed worlds; when one of
        // each is left, or exactly one world was played and one name gained
        // time, they match.
        var unnamed = worlds.Values.Where(w => w.Name == null).ToList();
        if (unnamed.Count > 0 && cur.Stats.Count > 0)
        {
            var claimed = hints.Fwls.Select(f => f.Name).Concat(worlds.Values.Select(w => w.Name)).OfType<string>().ToHashSet();
            var free = cur.Stats[0].KnownWorlds.Keys.Where(n => !claimed.Contains(n)).ToList();
            if (unnamed.Count == 1 && free.Count == 1)
            {
                unnamed[0].Name = free[0];
            }
            else
            {
                var active = SaveDiff.ActiveWorld(prev, cur);
                var played = SaveDiff.PlayedWorldNames(prev, cur).Where(free.Contains).ToList();
                var target = unnamed.FirstOrDefault(w => w.Uid == active);
                if (target != null && played.Count == 1) target.Name = played[0];
            }
        }

        foreach (var w in worlds.Values.Where(w => w.Seed == null && w.Name != null))
        {
            if (w.SeedHash == null && hints.SeedHashByName.TryGetValue(w.Name!, out var hash)) w.SeedHash = hash;
            if (w.SeedHash is not { } h) continue;
            w.Seed = WorldFile.StableHash(w.Name!) == h ? w.Name : knownSeed(h);
        }
    }

    /// <summary>Seeds the site already knows, by hash, for naming server worlds.</summary>
    public static async Task<Func<int, string?>> KnownSeeds(AppDbContext db)
    {
        var seeds = new HashSet<string>();
        seeds.UnionWith(await db.TrackMaps.AsNoTracking().Select(m => m.Seed).ToListAsync());
        seeds.UnionWith(await WorldsPublic.Seeds(db));
        seeds.UnionWith(await db.Set<CharWorld>().AsNoTracking().Where(w => w.Seed != null).Select(w => w.Seed!).ToListAsync());
        var byHash = new Dictionary<int, string>();
        foreach (var s in seeds) byHash.TryAdd(WorldFile.StableHash(s), s);
        return h => byHash.GetValueOrDefault(h);
    }

    /// <summary>Queue map generation for newly seeded worlds, within the user's daily allowance.</summary>
    public static async Task Generate(AppDbContext db, int userId, IEnumerable<CharWorld> worlds,
        IConfiguration config, IHttpClientFactory httpFactory)
    {
        var pending = worlds.Where(w => w.Seed != null && w.SeedgenAt == null).ToList();
        if (pending.Count == 0) return;
        var since = DateTime.UtcNow.AddDays(-1);
        int used = await db.Set<CharWorld>().CountAsync(w => w.SeedgenBy == userId && w.SeedgenAt > since);
        foreach (var w in pending)
        {
            if (used >= SeedgenPerDay) break;
            var status = await WorldsEndpoints.SubmitToSeedGen(config, httpFactory, w.Seed!);
            if (status.Status is "error" or "unknown") continue;
            w.SeedgenAt = DateTime.UtcNow;
            w.SeedgenBy = userId;
            used++;
        }
    }
}
