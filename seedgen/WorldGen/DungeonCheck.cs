using System.Text.Json;

namespace Vh.World;

/// <summary>
/// Dev check: run DungeonSim over every dungeon in an oracle loot dump and
/// compare what it predicts with what the game spawned.
///
///     dotnet run -- dungeon-check path/to/oracle.loot.json SeedName [worldGenVersion]
/// </summary>
public static class DungeonCheck
{
    // The location proxy is ZoneSystem's, not the prefab's.
    static readonly HashSet<string> Ignored = new() { "LocationProxy" };

    public static int Run(string[] args)
    {
        string path = args[0], seedName = args[1];
        int wgVersion = args.Length > 2 ? int.Parse(args[2]) : 2;
        string? only = args.Length > 3 ? args[3] : null;
        int seed = SeedGenSeed(seedName);
        var wg = new WorldGenerator(seed, wgVersion);
        var sim = new DungeonSim(DungeonCatalog.Instance, wg);
        using var doc = JsonDocument.Parse(File.ReadAllText(path));

        var stats = new Dictionary<string, (int n, int exact, Dictionary<string, (int ok, int bad)> keys)>();
        int shown = 0, layoutShown = 0;
        var layoutStats = new Dictionary<string, int>();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        foreach (var e in doc.RootElement.EnumerateArray())
        {
            string prefab = e.GetProperty("prefab").GetString()!;
            if (!sim.Supports(prefab) || (only != null && prefab != only)) continue;
            float x = e.GetProperty("x").GetSingle(), z = e.GetProperty("z").GetSingle();
            float y = wg.GetHeight(x, z);
            var truth = e.GetProperty("objects").EnumerateObject()
                .Where(p => !Ignored.Contains(p.Name)).ToDictionary(p => p.Name, p => p.Value.GetInt32());
            var res = sim.Simulate(prefab, new V3(x, y, z), seed);
            var got = res.Objects.Where(p => !Ignored.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value);
            if (e.TryGetProperty("rooms", out var gr))
            {
                var game = gr.EnumerateArray().Select(r => (r[0].GetString()!, new V3(r[1].GetSingle(), r[2].GetSingle(), r[3].GetSingle()))).ToList();
                int first = -1;
                for (int i = 0; i < Math.Max(game.Count, res.Rooms.Count); i++)
                {
                    if (i >= game.Count || i >= res.Rooms.Count || game[i].Item1 != res.Rooms[i]
                        || V3.Distance(game[i].Item2, res.RoomPositions[i]) > 0.01f) { first = i; break; }
                }
                layoutStats[prefab] = layoutStats.GetValueOrDefault(prefab) + (first < 0 ? 1 : 0);
                if (first < 0 && Environment.GetEnvironmentVariable("DUNGEON_EXACT") == "1")
                {
                    var dgp = res.GeneratorPosition;
                    for (int i = 0; i < game.Count; i++)
                    {
                        var g = game[i].Item2; var m = res.RoomPositions[i];
                        if (g != m)
                        {
                            var gv = g - dgp; var mv = m - dgp;
                            bool flip = (int)gv.x != (int)mv.x || (int)gv.y != (int)mv.y || (int)gv.z != (int)mv.z;
                            Console.WriteLine($"  inexact {prefab}@{x},{z} room #{i} {game[i].Item1}: game ({g.x:R},{g.y:R},{g.z:R}) sim ({m.x:R},{m.y:R},{m.z:R}){(flip ? "  SEED FLIP" : "")}");
                        }
                    }
                }
                if (first >= 0 && layoutShown++ < 6)
                {
                    var d = e.GetProperty("dungeon");
                    Console.WriteLine($"layout {prefab} at {x},{y},{z}: rooms game {game.Count} sim {res.Rooms.Count}, first diff at #{first}; " +
                        $"dg seed game {d.GetProperty("seed").GetInt32()} sim {res.GeneratorSeed}, dg pos game {d.GetProperty("pos")} sim {res.GeneratorPosition}");
                    for (int i = Math.Max(0, first - 1); i < Math.Min(first + 2, Math.Max(game.Count, res.Rooms.Count)); i++)
                        Console.WriteLine($"    #{i} game {(i < game.Count ? game[i].ToString() : "-")}  sim {(i < res.Rooms.Count ? (res.Rooms[i], res.RoomPositions[i]).ToString() : "-")}");
                }
            }

            var st = stats.TryGetValue(prefab, out var prev) ? prev : (n: 0, exact: 0, keys: new Dictionary<string, (int ok, int bad)>());
            bool exact = true;
            foreach (var k in truth.Keys.Union(got.Keys))
            {
                bool ok = truth.GetValueOrDefault(k) == got.GetValueOrDefault(k);
                var kv = st.keys.GetValueOrDefault(k);
                st.keys[k] = ok ? (kv.ok + 1, kv.bad) : (kv.ok, kv.bad + 1);
                exact &= ok;
            }
            st = (st.n + 1, st.exact + (exact ? 1 : 0), st.keys);
            stats[prefab] = st;
            if (!exact && shown++ < 4)
            {
                Console.WriteLine($"mismatch {prefab} at {x},{y},{z}:");
                foreach (var k in truth.Keys.Union(got.Keys).Where(k => truth.GetValueOrDefault(k) != got.GetValueOrDefault(k)).Take(12))
                    Console.WriteLine($"    {k}: game {truth.GetValueOrDefault(k)} sim {got.GetValueOrDefault(k)}");
            }
        }
        Console.WriteLine($"simulated in {sw.ElapsedMilliseconds} ms");
        foreach (var (prefab, st) in stats.OrderBy(s => s.Key))
        {
            Console.WriteLine($"{prefab}: {st.exact}/{st.n} exact" + (layoutStats.ContainsKey(prefab) ? $", layout {layoutStats[prefab]}/{st.n}" : ""));
            foreach (var k in new[] { "Pickable_BlackCoreStand", "blackmarble_altar_crystal", "TreasureChest_dvergrtown",
                         "Pickable_MountainCaveRandom", "Pickable_MountainCaveCrystal", "TreasureChest_mountaincave" })
                if (st.keys.TryGetValue(k, out var kv)) Console.WriteLine($"    {k}: {kv.ok}/{kv.ok + kv.bad}");
        }
        return 0;
    }

    /// <summary>
    ///     dotnet run -- pois-check path/to/_main.N.db2 SeedName path/to/oracle.loot.json
    /// Reads the world as a job does (no loot dump, so dungeons go through
    /// DungeonSim) and checks the dungeon items against the oracle's spawns.
    /// </summary>
    public static int RunPois(string[] args)
    {
        string db = args[0], seedName = args[1], truthPath = args[2];
        int seed = SeedGenSeed(seedName);
        var wg = new WorldGenerator(seed, 2);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var pois = LocationFinder.ReadFromWorldDb(db, seed, out _, wg) ?? new();
        Console.WriteLine($"read {pois.Count} POIs in {sw.ElapsedMilliseconds} ms");
        var truth = LocationFinder.LoadLoot(truthPath)!;
        var finds = new[] { ("Pickable_BlackCoreStand", "Black Core"), ("blackmarble_altar_crystal", "Sealbreaker Fragment"),
                            ("Pickable_MountainCaveRandom", "Fenris Claw/Hair"), ("Pickable_MountainCaveCrystal", "Crystal") };
        var ok = new Dictionary<string, (int ok, int n)>();
        int shown = 0;
        foreach (var p in pois.Where(p => p.Type is "InfestedMine" or "MountainCave"))
        {
            if (!truth.TryGetValue(LocationFinder.LootKey(p.Prefab!, p.X, p.Z), out var t)) continue;
            foreach (var (obj, item) in finds)
            {
                if ((obj.StartsWith("Pickable_Mountain") ? "MountainCave" : "InfestedMine") != p.Type) continue;
                int want = t.Objects.GetValueOrDefault(obj);
                var s = (p.Items ?? Array.Empty<string>()).FirstOrDefault(i => i.StartsWith(item + " x"));
                int got = s == null ? 0 : int.Parse(s[(item.Length + 2)..]);
                var c = ok.GetValueOrDefault(item);
                ok[item] = (c.ok + (got == want ? 1 : 0), c.n + 1);
            }
            if (shown++ < 3) Console.WriteLine($"  {p.Name} {p.X},{p.Z}: {string.Join(", ", p.Items ?? Array.Empty<string>())}");
        }
        foreach (var (item, c) in ok) Console.WriteLine($"{item}: {c.ok}/{c.n} match the game");
        return 0;
    }

    static int SeedGenSeed(string s) => SeedGen.ValheimSeedHash.GetStableHashCode(s);
}
