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
        var campStats = new Dictionary<string, int[]>();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        foreach (var e in doc.RootElement.EnumerateArray())
        {
            string prefab = e.GetProperty("prefab").GetString()!;
            if (!sim.Supports(prefab) || (only != null && prefab != only)) continue;
            float x = e.GetProperty("x").GetSingle(), z = e.GetProperty("z").GetSingle();
            float y = wg.GetHeight(x, z);
            // Camps sampled with their whole zone: the zone's vegetation is in the
            // objects too, so compare the layout and the marked pieces instead.
            if (e.TryGetProperty("wholeZone", out _))
            {
                CheckCamp(e, prefab, sim.Simulate(prefab, new V3(x, y, z), seed), x, z, campStats);
                continue;
            }
            var truth = e.GetProperty("objects").EnumerateObject()
                .Where(p => !Ignored.Contains(p.Name)).ToDictionary(p => p.Name, p => p.Value.GetInt32());
            var res = sim.Simulate(prefab, new V3(x, y, z), seed);
            var got = res.Objects.Where(p => !Ignored.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value);
            // Vegvisirs (the oracle lists each revealed location once).
            if (e.TryGetProperty("vegvisirs", out var gvs))
                foreach (var v in gvs.EnumerateArray()) truth["vegvisir:" + v.GetString()] = 1;
            foreach (var v in res.Vegvisirs.Distinct()) got["vegvisir:" + v] = 1;
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
        foreach (var (prefab, c) in campStats.OrderBy(s => s.Key))
            Console.WriteLine($"{prefab}: layout {c[1]}/{c[0]}, generator seed {c[2]}/{c[0]}, marked pieces {c[3]}/{c[0]} " +
                              $"({c[4]} in the game, {c[5]} simulated)");
        foreach (var (prefab, st) in stats.OrderBy(s => s.Key))
        {
            Console.WriteLine($"{prefab}: {st.exact}/{st.n} exact" + (layoutStats.ContainsKey(prefab) ? $", layout {layoutStats[prefab]}/{st.n}" : ""));
            foreach (var k in new[] { "Pickable_BlackCoreStand", "blackmarble_altar_crystal", "TreasureChest_dvergrtown",
                         "Pickable_MountainCaveRandom", "Pickable_MountainCaveCrystal", "TreasureChest_mountaincave" })
                if (st.keys.TryGetValue(k, out var kv)) Console.WriteLine($"    {k}: {kv.ok}/{kv.ok + kv.bad}");
            foreach (var (k, kv) in st.keys.Where(k => k.Key.StartsWith("vegvisir:")))
                Console.WriteLine($"    {k}: {kv.ok}/{kv.ok + kv.bad}");
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
            var vv = ok.GetValueOrDefault("Vegvisirs");
            bool vvOk = (p.Vegvisirs ?? Array.Empty<string>()).OrderBy(v => v).SequenceEqual(t.Vegvisirs.OrderBy(v => v));
            ok["Vegvisirs"] = (vv.ok + (vvOk ? 1 : 0), vv.n + 1);
            if (shown++ < 3) Console.WriteLine($"  {p.Name} {p.X},{p.Z}: {string.Join(", ", p.Items ?? Array.Empty<string>())}" +
                                               $"{(p.Vegvisirs is { Length: > 0 } pv ? $"; vegvisir → {string.Join(", ", pv)}" : "")}");
        }
        foreach (var (item, c) in ok) Console.WriteLine($"{item}: {c.ok}/{c.n} match the game");
        Console.WriteLine($"  ({pois.Count(p => p.Type is "InfestedMine" or "MountainCave" && p.Vegvisirs is { Length: > 0 })} mines/frost caves with a vegvisir)");

        // Maypoles: the simulated farm layouts' POIs against the oracle's whole-zone spawns.
        var gameMarks = truth.Values.Where(t => t.WholeZone).SelectMany(t => t.Marks ?? Array.Empty<(string, float, float)>()).ToList();
        if (truth.Values.Any(t => t.WholeZone))
        {
            var simMarks = pois.Where(p => p.Type == "Maypole").ToList();
            int matched = gameMarks.Where(m => m.Item1 == "piece_maypole").Count(m => simMarks.Any(p => MathF.Abs(p.X - m.Item2) < 0.05f && MathF.Abs(p.Z - m.Item3) < 0.05f));
            int farms = pois.Count(p => p.Prefab == "WoodFarm1");
            Console.WriteLine($"Maypole POIs: {simMarks.Count} simulated, {gameMarks.Count(m => m.Item1 == "piece_maypole")} in the game, {matched} at the same spot " +
                              $"({farms} farms, {pois.Count(p => p.Prefab == "WoodFarm1" && (p.Items ?? Array.Empty<string>()).Contains("Maypole"))} flagged)");
            var simGran = pois.Where(p => p.Type == "Granary").ToList();
            var gameGran = gameMarks.Where(m => m.Item1 == "northvillage_granary").ToList();
            int gmatched = gameGran.Count(m => simGran.Any(p => MathF.Abs(p.X - m.Item2) < 0.05f && MathF.Abs(p.Z - m.Item3) < 0.05f));
            Console.WriteLine($"Granary POIs: {simGran.Count} simulated, {gameGran.Count} in the game, {gmatched} at the same spot " +
                              $"({pois.Count(p => p.Prefab == "NorthVillage")} villages)");
        }
        return 0;
    }

    /// <summary>
    /// One camp against the oracle's whole-zone spawn. Counts per prefab:
    /// [n, layout exact, generator seed equal, marks equal, marks in game, marks simulated].
    /// </summary>
    static void CheckCamp(JsonElement e, string prefab, DungeonResult res, float x, float z, Dictionary<string, int[]> stats)
    {
        var c = stats.TryGetValue(prefab, out var prev) ? prev : stats[prefab] = new int[6];
        c[0]++;
        if (e.TryGetProperty("error", out var err)) { Console.WriteLine($"  {prefab}@{x},{z}: oracle {err}"); return; }
        var game = e.TryGetProperty("rooms", out var gr)
            ? gr.EnumerateArray().Select(r => (Name: r[0].GetString()!, Pos: new V3(r[1].GetSingle(), r[2].GetSingle(), r[3].GetSingle()))).ToList()
            : new();
        int first = -1;
        for (int i = 0; i < Math.Max(game.Count, res.Rooms.Count); i++)
            if (i >= game.Count || i >= res.Rooms.Count || game[i].Name != res.Rooms[i]
                || V3.Distance(game[i].Pos, res.RoomPositions[i]) > 0.01f) { first = i; break; }
        if (first < 0) c[1]++;
        int gseed = e.TryGetProperty("dungeon", out var d) ? d.GetProperty("seed").GetInt32() : 0;
        if (gseed == res.GeneratorSeed) c[2]++;

        var gm = e.TryGetProperty("marks", out var mk)
            ? mk.EnumerateArray().Select(m => (m[0].GetString()!, new V3(m[1].GetSingle(), m[2].GetSingle(), m[3].GetSingle()))).ToList()
            : new();
        // Marked rooms (granaries) come from the layout itself.
        gm.AddRange(game.Where(r => DungeonSim.MarkedPrefabs.Contains(r.Name)));
        // The game snaps pieces to the ground after placing them, so compare x/z.
        bool marksOk = gm.Count == res.Marks.Count && gm.All(g => res.Marks.Any(s => s.Prefab == g.Item1
            && MathF.Abs(s.Pos.x - g.Item2.x) < 0.05f && MathF.Abs(s.Pos.z - g.Item2.z) < 0.05f));
        if (marksOk) c[3]++;
        c[4] += gm.Count;
        c[5] += res.Marks.Count;

        if (first >= 0 || !marksOk)
        {
            var gp = d.ValueKind == JsonValueKind.Object ? d.GetProperty("pos").ToString() : "?";
            Console.WriteLine($"  {prefab}@{x},{z}: rooms game {game.Count} sim {res.Rooms.Count}, first diff #{first}; " +
                $"seed game {gseed} sim {res.GeneratorSeed}; pos game {gp} sim {res.GeneratorPosition}; marks game {gm.Count} sim {res.Marks.Count}");
            if (first >= 0)
                for (int i = Math.Max(0, first - 1); i < Math.Min(first + 2, Math.Max(game.Count, res.Rooms.Count)); i++)
                    Console.WriteLine($"      #{i} game {(i < game.Count ? game[i].ToString() : "-")}  sim {(i < res.Rooms.Count ? (res.Rooms[i], res.RoomPositions[i]).ToString() : "-")}");
        }
    }

    /// <summary>
    ///     dotnet run -- contents-check dir...
    /// Every location the oracle sampled (dir/seed&lt;hash&gt;/oracle.loot.json, as
    /// seedgen's data folder lays them out) against DungeonSim: the counts of
    /// each content object (DungeonCatalog.ContentKinds) and whether a vegvisir
    /// is there. Per prefab, how many instances match exactly.
    /// </summary>
    public static int RunContents(string[] args)
    {
        var kinds = DungeonCatalog.ContentKinds;
        var stats = new SortedDictionary<string, (int n, int exact, Dictionary<string, int> bad)>();
        var unsupported = new SortedDictionary<string, int>();
        // Chests: prefab -> (samples, exact, unpredictable).
        var chestStats = new SortedDictionary<string, (int n, int exact, int unknown)>();
        int shown = 0, chestShown = 0;
        var files = args.SelectMany(d => Directory.GetDirectories(d, "seed*"))
            .Select(d => Path.Combine(d, "oracle.loot.json")).Where(File.Exists).ToList();
        foreach (var file in files)
        {
            int seed = int.Parse(Path.GetFileName(Path.GetDirectoryName(file))!["seed".Length..]);
            var wg = new WorldGenerator(seed, 2);
            var sim = new DungeonSim(DungeonCatalog.Instance, wg);
            using var doc = JsonDocument.Parse(File.ReadAllText(file));
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                string prefab = e.GetProperty("prefab").GetString()!;
                if (e.TryGetProperty("wholeZone", out _) || !e.TryGetProperty("objects", out var objs)) continue;
                if (!sim.Supports(prefab)) { unsupported[prefab] = unsupported.GetValueOrDefault(prefab) + 1; continue; }
                float x = e.GetProperty("x").GetSingle(), z = e.GetProperty("z").GetSingle();
                var res = sim.Simulate(prefab, new V3(x, wg.GetHeight(x, z), z), seed);
                if (DungeonCatalog.Instance.Locations[prefab] is { Algorithm: -1, Tree.Chests.Length: > 0 })
                {
                    static string Key(IEnumerable<IEnumerable<ChestItem>> chests) => string.Join(" | ", chests
                        .Select(c => string.Join(",", c.Select(i => $"{i.Item}x{i.Count}").OrderBy(k => k, StringComparer.Ordinal)))
                        .OrderBy(k => k, StringComparer.Ordinal));
                    string truthChests = Key(e.GetProperty("chests").EnumerateArray()
                        .Select(c => c.EnumerateArray().Select(i => new ChestItem(i[0].GetString()!, i[1].GetInt32()))));
                    var cs = chestStats.GetValueOrDefault(prefab);
                    if (res.Chests == null) cs.unknown++;
                    else if (Key(res.Chests) == truthChests) cs.exact++;
                    else if (chestShown++ < 8)
                        Console.WriteLine($"  {prefab} @{x},{z} seed {seed}: chests game [{truthChests}] sim [{Key(res.Chests)}]");
                    cs.n++;
                    chestStats[prefab] = cs;
                }
                // Objects seedgen leaves out of a POI's contents (lava rolls) aren't compared.
                var truth = objs.EnumerateObject().Where(p => kinds.ContainsKey(p.Name) && !res.Uncertain.Contains(p.Name))
                    .ToDictionary(p => p.Name, p => p.Value.GetInt32());
                var got = res.Objects.Where(p => kinds.ContainsKey(p.Key) && !res.Uncertain.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value);
                // The oracle reports a dungeon's vegvisirs, but for a plain location only the
                // RandomSpawn'd ones ("present"); an always-there vegvisir can't be compared.
                bool dungeon = e.TryGetProperty("rooms", out _);
                bool gameVeg = (e.TryGetProperty("vegvisirs", out var vv) && vv.GetArrayLength() > 0)
                    || (e.TryGetProperty("present", out var pr) && pr.EnumerateObject().Any(p => p.Name.Contains("Vegvisir")));
                if (gameVeg) truth["(vegvisir)"] = 1;
                if (res.Vegvisirs.Count > 0 && (dungeon || gameVeg || !AlwaysVegvisir(prefab))) got["(vegvisir)"] = 1;
                var st = stats.TryGetValue(prefab, out var prev) ? prev : (n: 0, exact: 0, bad: new Dictionary<string, int>());
                var diff = truth.Keys.Union(got.Keys).Where(k => truth.GetValueOrDefault(k) != got.GetValueOrDefault(k)).ToList();
                foreach (var k in diff) st.bad[k] = st.bad.GetValueOrDefault(k) + 1;
                stats[prefab] = (st.n + 1, st.exact + (diff.Count == 0 ? 1 : 0), st.bad);
                if (diff.Count > 0 && shown++ < 8)
                    Console.WriteLine($"  {prefab} @{x},{z} seed {seed}: " +
                        string.Join(", ", diff.Select(k => $"{k} game {truth.GetValueOrDefault(k)} sim {got.GetValueOrDefault(k)}")));
            }
        }
        Console.WriteLine($"{files.Count} seeds");
        foreach (var (prefab, st) in stats)
            Console.WriteLine($"{prefab}: {st.exact}/{st.n} exact" +
                (st.bad.Count > 0 ? "  off: " + string.Join(", ", st.bad.OrderByDescending(b => b.Value).Take(5).Select(b => $"{b.Key} {b.Value}")) : ""));
        if (unsupported.Count > 0) Console.WriteLine("not simulated: " + string.Join(", ", unsupported.Select(u => $"{u.Key} {u.Value}")));
        Console.WriteLine("chests:");
        foreach (var (prefab, cs) in chestStats)
            Console.WriteLine($"  {prefab}: {cs.exact}/{cs.n} exact" + (cs.unknown > 0 ? $", {cs.unknown} unpredictable" : ""));
        return 0;
    }

    /// <summary>
    /// The browser's path end to end: place the seed's locations, build POIs
    /// without a saved world or oracle (chests from DungeonSim), and compare each
    /// POI's chests with the oracle sample at the same spot.
    /// </summary>
    public static int RunChests(string[] args)
    {
        var dirs = Directory.GetDirectories(args[0], "seed*").Where(d => File.Exists(Path.Combine(d, "oracle.loot.json")))
            .OrderBy(d => d, StringComparer.Ordinal).Take(args.Length > 1 ? int.Parse(args[1]) : int.MaxValue).ToList();
        var (rules, alts, _) = Locations.LocationRule.LoadEmbedded();
        var stats = new SortedDictionary<string, (int n, int exact, int none)>();
        int shown = 0;
        static string Key(IEnumerable<IEnumerable<ChestItem>>? chests) => chests == null ? "" : string.Join(" | ", chests
            .Select(c => string.Join(",", c.Select(i => $"{i.Item}x{i.Count}").OrderBy(k => k, StringComparer.Ordinal)))
            .Where(c => c != "").OrderBy(k => k, StringComparer.Ordinal));
        foreach (var dir in dirs)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int seed = int.Parse(Path.GetFileName(dir)["seed".Length..]);
            var wg = new WorldGenerator(seed, 2);
            var grid = WorldGrid.GenerateParallel(seed, 2);
            var placed = new Locations.LocationPlacer(wg, Locations.BiomeData.Build(grid, seed, alts), rules).RunToEnd();
            var pois = LocationFinder.FromPlaced(placed, seed, wg);
            var loot = LocationFinder.LoadLoot(Path.Combine(dir, "oracle.loot.json"))!;
            int matched = 0;
            foreach (var poi in pois)
            {
                if (poi.Prefab == null || !loot.TryGetValue(LocationFinder.LootKey(poi.Prefab, poi.X, poi.Z), out var s)) continue;
                if (DungeonCatalog.Instance.Locations.GetValueOrDefault(poi.Prefab) is not { Algorithm: -1, Tree.Chests.Length: > 0 }) continue;
                matched++;
                string truth = Key(s.Chests), got = Key(poi.Chests);
                var st = stats.GetValueOrDefault(poi.Prefab);
                st.n++;
                if (truth == got) st.exact++;
                else if (shown++ < 8) Console.WriteLine($"  {poi.Prefab} @{poi.X},{poi.Z} seed {seed}: game [{truth}] browser [{got}]");
                stats[poi.Prefab] = st;
            }
            Console.WriteLine($"seed {seed}: {placed.Count} placed, {matched} chest locations matched to oracle samples ({sw.ElapsedMilliseconds} ms)");
        }
        foreach (var (prefab, st) in stats) Console.WriteLine($"  {prefab}: {st.exact}/{st.n} exact");
        return 0;
    }

    /// <summary>A plain location whose vegvisir sits under no RandomSpawn (always there).</summary>
    static bool AlwaysVegvisir(string prefab)
    {
        var t = DungeonCatalog.Instance.Locations[prefab].Tree;
        return t.Vegvisirs.Any(v =>
        {
            for (int n = v.Node; n >= 0; n = t.Nodes[n].Parent)
                if (t.RandomSpawns.Any(r => r.Node == n) || t.RandomObjects.Any(r => r.Objects.Any(o => o.Node == n))) return false;
            return true;
        });
    }

    static int SeedGenSeed(string s) => SeedGen.ValheimSeedHash.GetStableHashCode(s);
}
