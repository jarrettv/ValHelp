using System.Collections.Concurrent;
using System.Text.Json;

namespace SeedGen;

/// <summary>
/// A seed's <c>pois</c> file is derived from its saved world db, so when the
/// derivation changes the cached files go stale. Each pois file is stamped with
/// <see cref="Version"/> in <c>pois.ver</c>; one written by an older seedgen is
/// re-derived from the db (a few seconds, no server boot) the first time it is
/// asked for.
/// </summary>
public static class PoiCache
{
    /// <summary>Bump whenever LocationFinder's output changes.</summary>
    // 2: infested mine / frost cave contents from DungeonSim.
    // 3: farm maypoles (DungeonSim lays farms out on the zone's terrain).
    // 4: Deep North village granaries.
    // 5: vegvisirs inside infested mines and frost caves.
    // 6: every location's contents (chests, enemies, finds) from DungeonSim.
    // 7: contents: crypts left out (rotation), lava rolls and unreliable objects dropped.
    // 8: wild beehives in contents.
    public const int Version = 8;

    static readonly ConcurrentDictionary<string, object> s_locks = new();

    public static void MarkCurrent(string dir) =>
        File.WriteAllText(Path.Combine(dir, "pois.ver"), Version.ToString());

    static bool IsCurrent(string dir) =>
        int.TryParse(TryRead(Path.Combine(dir, "pois.ver")), out var v) && v == Version;

    static string? TryRead(string path) => File.Exists(path) ? File.ReadAllText(path) : null;

    public static void EnsureCurrent(string dir, int seedHash, int worldGen)
    {
        if (IsCurrent(dir) || !File.Exists(Path.Combine(dir, "pois")) || !File.Exists(Path.Combine(dir, "db")))
            return;
        lock (s_locks.GetOrAdd(dir, _ => new object()))
        {
            if (IsCurrent(dir)) return;
            Rebuild(dir, seedHash, new Vh.World.WorldGenerator(seedHash, worldGen));
        }
    }

    /// <summary>Re-derives <c>pois</c> from the seed's saved db (and oracle loot dump, if any).</summary>
    public static int Rebuild(string dir, int seedHash, Vh.World.WorldGenerator wg)
    {
        var loot = Vh.World.LocationFinder.LoadLoot(Path.Combine(dir, "oracle.loot.json"));
        var pois = Vh.World.LocationFinder.ReadFromWorldDb(Path.Combine(dir, "db"), seedHash, out _, wg, loot);
        if (pois == null || pois.Count == 0) return 0;
        // Write-then-move so a concurrent reader never sees a half-written file.
        var tmp = Path.Combine(dir, "pois.tmp");
        File.WriteAllText(tmp, JsonSerializer.Serialize(pois, Json.CamelCase));
        File.Move(tmp, Path.Combine(dir, "pois"), overwrite: true);
        MarkCurrent(dir);
        return pois.Count;
    }
}
