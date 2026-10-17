using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Text;
using System.IO;
using System.IO.Compression;
using System.Globalization;
using BepInEx;
using HarmonyLib;
using UnityEngine;

namespace ValHelp.Oracle;

/// <summary>
/// Server-side worldgen oracle for seedgen.
///
/// <para>Dumps the game's own <c>WorldGenerator</c> output over the minimap grid so
/// a managed reimplementation can be diffed against ground truth. This exists
/// because the dedicated server never produces the minimap textures itself:
/// <c>GenerateWorldMap()</c> is only reachable from <c>Minimap.Update()</c>, which
/// returns early when <c>SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null</c>
/// — guaranteed by <c>-nographics</c> — and again when there is no main camera or
/// local player.</para>
///
/// <para>So we skip <c>Minimap</c> entirely and call <c>WorldGenerator.instance</c>
/// directly, which <i>is</i> live on a server because <c>ZoneSystem</c> depends on
/// it. That is strictly better for validation: it yields <b>raw float32 heights</b>
/// rather than the RHalf the texture would store, which separates a worldgen/Perlin
/// bug from a float-to-half rounding bug instead of conflating the two.</para>
///
/// <para>Enabled by <c>VALHELP_ORACLE=1</c>; output directory from
/// <c>VALHELP_ORACLE_DIR</c> (defaults to the world save directory). Off by
/// default so ordinary seedgen jobs are not slowed by the full-grid sweep.</para>
/// </summary>
[BepInPlugin(Guid, "ValHelp Worldgen Oracle", "1.0.0")]
public class OraclePlugin : BaseUnityPlugin
{
    public const string Guid = "valhelp.worldgen.oracle";

    /// <summary>Sentinels the seedgen worker greps the server log for.</summary>
    const string TagDone = "[valhelp-oracle] DONE";
    const string TagFail = "[valhelp-oracle] FAILED";
    const string Tag = "[valhelp-oracle]";

    // Minimap grid, from Minimap.GenerateWorldMap. Mirrored by
    // AltBiomeWorldData.c_textureSize / c_pixelSize / c_halfPixel.
    const int GridSize = 2048;
    const float PixelSize = 12f;

    bool _ran;

    // RandomSpawn pieces actually present in the location being sampled. Static
    // scenery (e.g. the Moder vegvisir) has no ZNetView, so it never shows up
    // among spawned network objects; instead, SpawnLocation leaves the prefab
    // template in its rolled state until it calls Reset() on every RandomSpawn,
    // so the first Reset() is the moment to read it. A piece counts only if it
    // and every parent are active — a successful roll inside a failed parent
    // RandomSpawn is still hidden.
    static GameObject s_asset;
    static List<string> s_present;

    [HarmonyPatch(typeof(RandomSpawn), nameof(RandomSpawn.Reset))]
    static class RandomSpawnPatch
    {
        static void Prefix()
        {
            if (s_asset == null || s_present != null) return;
            s_present = s_asset.GetComponentsInChildren<RandomSpawn>(true)
                .Where(rs => ActiveChain(rs.transform))
                .Select(rs => rs.gameObject.name)
                .ToList();
        }
    }

    static bool ActiveChain(Transform t)
    {
        for (; t != null; t = t.parent)
            if (!t.gameObject.activeSelf) return false;
        return true;
    }

    void Awake()
    {
        new Harmony(Guid).PatchAll(typeof(RandomSpawnPatch));
    }

    void Update()
    {
        if (_ran) return;

        var wg = WorldGenerator.instance;
        if (wg == null || ZNet.World == null) return;

        // Wait for location generation. The sweep below blocks the main thread for
        // seconds; running it mid-generation would distort seedgen's own timings
        // and risk its timeout.
        var zs = ZoneSystem.instance;
        if (zs == null || !zs.LocationsGenerated) return;

        _ran = true;

        bool oracle = Environment.GetEnvironmentVariable("VALHELP_ORACLE") == "1";
        bool loot = Environment.GetEnvironmentVariable("VALHELP_LOOT") == "1";
        if (!oracle && !loot)
        {
            Log(Tag + " disabled (set VALHELP_LOOT=1 and/or VALHELP_ORACLE=1 to enable)");
            return;
        }

        StartCoroutine(Run(wg, oracle));
    }

    /// <summary>
    /// Save, sample loot (one location per frame), then on oracle jobs the
    /// worldgen sweep. A coroutine because Unity only frees Destroy()ed objects at
    /// the end of a frame: sampling hundreds of dungeons in one frame keeps every
    /// one of them alive and the server gets OOM-killed.
    /// </summary>
    IEnumerator Run(WorldGenerator wg, bool oracle)
    {
        string dir;
        try
        {
            // Save the freshly generated world *before* sampling. The samples spawn
            // and destroy hundreds of locations; dungeons among them leave
            // DungeonDB/ZoneSystem in a state where ZNet.Save skips saving, so a
            // save on shutdown never happens. Saving first also keeps the samples'
            // throwaway objects out of the world seedgen reads POIs from.
            ZNet.instance.Save(sync: true);
            Log(Tag + " world saved");
            dir = OutDir();
        }
        catch (Exception ex)
        {
            Log(TagFail + ": " + ex);
            yield break;
        }

        // Cheap and read-only, so every job gets it; a failure here must not cost
        // the job its loot.
        try { DumpDrops(Path.Combine(dir, "oracle.drops.json")); }
        catch (Exception ex) { Log($"{Tag} drops failed: {ex}"); }

        var sw = Stopwatch.StartNew();
        // Dungeons (frost caves, infested mines, winding tunnels) cost minutes per
        // seed to generate, so normal jobs skip them; oracle jobs, or
        // VALHELP_LOOT_DUNGEONS=1, include them.
        // TODO(perf): make dungeon sampling cheap enough for every job — e.g. a
        // second pass after the map is ready, or generating only the rooms'
        // spawners/chests instead of full room geometry.
        bool dungeons = oracle || Environment.GetEnvironmentVariable("VALHELP_LOOT_DUNGEONS") == "1";
        var loot = DumpLoot(wg, Path.Combine(dir, "oracle.loot.json"), checkRotation: oracle, dungeons);
        while (true)
        {
            bool more;
            try { more = loot.MoveNext(); }
            catch (Exception ex)
            {
                Log(TagFail + ": " + ex);
                yield break;
            }
            if (!more) break;
            yield return loot.Current;
        }
        Log($"{Tag} loot {sw.ElapsedMilliseconds}ms");

        if (oracle)
        {
            try { DumpWorld(wg, dir); }
            catch (Exception ex)
            {
                Log(TagFail + ": " + ex);
                yield break;
            }
        }
        Log(TagDone);
    }

    // Goes to stdout, because the seedgen worker only ever reads the server's
    // redirected stdout. Fully qualified: Valheim ships its own `Console` class
    // (the in-game one), which otherwise wins name resolution here.
    static void Log(string msg)
    {
        System.Console.WriteLine(msg);
        System.Console.Out.Flush();
    }

    static string OutDir()
    {
        string dir = Environment.GetEnvironmentVariable("VALHELP_ORACLE_DIR");
        if (string.IsNullOrEmpty(dir))
            dir = ZNet.World.GetSaveDirectory(FileHelpers.FileSource.Local);
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>Oracle jobs: worldgen ground truth over the minimap grid.</summary>
    void DumpWorld(WorldGenerator wg, string dir)
    {
        int seed = wg.GetSeed();
        Log($"{Tag} start seed={seed} grid={GridSize} dir={dir}");

        var sw = Stopwatch.StartNew();
        WritePerlinFixture(Path.Combine(dir, "oracle.perlin.f32.gz"));
        Log($"{Tag} perlin fixture {sw.ElapsedMilliseconds}ms");

        sw.Restart();
        int n = GridSize * GridSize;
        var height = new byte[n * 4];
        var biome = new byte[n];
        var forest = new byte[n * 4];

        int half = GridSize / 2;
        float halfPixel = PixelSize / 2f;

        for (int i = 0; i < GridSize; i++)
        {
            float wy = (i - half) * PixelSize + halfPixel;
            int row = i * GridSize;
            for (int j = 0; j < GridSize; j++)
            {
                float wx = (j - half) * PixelSize + halfPixel;

                Heightmap.Biome b = wg.GetBiome(wx, wy);
                // Exactly the call Minimap.GenerateWorldMap makes: the 4-arg
                // overload, so preGeneration=false and riverPreDN=true.
                float h = wg.GetBiomeHeight(b, wx, wy, out Color _);
                float f = WorldGenerator.GetForestFactor(new Vector3(wx, 0f, wy));

                int k = row + j;
                biome[k] = (byte)ToIndex(b);
                WriteFloat(height, k * 4, h);
                WriteFloat(forest, k * 4, f);
            }

            if ((i & 255) == 255) Log($"{Tag} row {i + 1}/{GridSize}");
        }
        Log($"{Tag} grid sweep {sw.ElapsedMilliseconds}ms");

        WriteGz(Path.Combine(dir, "oracle.height.f32.gz"), height);
        WriteGz(Path.Combine(dir, "oracle.biome.u8.gz"), biome);
        WriteGz(Path.Combine(dir, "oracle.forest.f32.gz"), forest);
        WriteMeta(Path.Combine(dir, "oracle.json"), seed);
    }

    /// <summary>
    /// Ground truth for seedgen's loot: spawns every location whose contents we
    /// report through the game's own <c>ZoneSystem.SpawnLocation</c>, with the seed
    /// the game uses when a player first loads the zone
    /// (<c>worldSeed + zoneX*4271 + zoneY*9187</c>), and records what actually
    /// appeared — beehives, each chest's items, and every spawned object — then
    /// destroys it again. The chest's items are fixed at this moment: Container
    /// rolls them in Awake and saves them to its ZDO, so opening it later never
    /// re-rolls.
    ///
    /// Rotation is identity; the game's own comes from an unseeded RNG state.
    /// With <paramref name="checkRotation"/> each location is spawned a second
    /// time at 90° and the results compared, to show rotation doesn't matter.
    /// </summary>
    IEnumerator DumpLoot(WorldGenerator wg, string path, bool checkRotation, bool dungeons)
    {
        var zs = ZoneSystem.instance;
        var spawn = typeof(ZoneSystem).GetMethod("SpawnLocation", BindingFlags.NonPublic | BindingFlags.Instance,
            null, new[] { typeof(ZoneSystem.ZoneLocation), typeof(int), typeof(Vector3), typeof(Quaternion),
                          typeof(ZoneSystem.SpawnMode), typeof(List<GameObject>), typeof(bool) }, null)
            ?? throw new MissingMethodException("ZoneSystem.SpawnLocation");
        var instancesField = typeof(ZNetScene).GetField("m_instances", BindingFlags.NonPublic | BindingFlags.Instance)
            ?? throw new MissingFieldException("ZNetScene.m_instances");
        var views = (Dictionary<ZDO, ZNetView>)instancesField.GetValue(ZNetScene.instance);

        string Sample(ZoneSystem.LocationInstance inst, int seed, Quaternion rot, out string objectsJson)
        {
            var before = new HashSet<ZDO>(views.Keys);
            // Load before reading Asset: the first spawn of a type otherwise sees an
            // unloaded prefab, and the presence snapshot comes out empty.
            inst.m_location.m_prefab.Load();
            s_asset = inst.m_location.m_prefab.Asset;
            s_present = null;
            spawn.Invoke(zs, new object[] { inst.m_location, seed, inst.m_position, rot,
                                            ZoneSystem.SpawnMode.Full, new List<GameObject>(), false });
            var present = s_present ?? new List<string>();
            s_asset = null;
            s_present = null;
            var spawned = views.Where(v => !before.Contains(v.Key) && v.Value).Select(v => v.Value).ToList();

            // By prefab name: in 1.0 the Beehive component isn't on the networked root.
            int beehives = spawned.Count(v => Utils.GetPrefabName(v.gameObject) == "Beehive");
            var chests = new List<string>();
            foreach (var c in spawned.Select(v => v.GetComponent<Container>()).Where(c => c))
            {
                var items = c.GetInventory().GetAllItems()
                    .Select(i => $"[\"{Escape(i.m_dropPrefab ? i.m_dropPrefab.name : i.m_shared.m_name)}\",{i.m_stack}]");
                chests.Add("[" + string.Join(",", items) + "]");
            }
            objectsJson = "{" + string.Join(",", spawned
                .GroupBy(v => Utils.GetPrefabName(v.gameObject))
                .OrderBy(g => g.Key)
                .Select(g => $"\"{Escape(g.Key)}\":{g.Count()}")) + "}";

            // Dungeons (frost caves, crypts…) generate their rooms during the spawn;
            // their enemies are CreatureSpawners/SpawnAreas and their vegvisirs
            // static scenery, so read them off the active generated hierarchy.
            var creatures = new List<string>();
            var vegvisirs = new List<string>();
            // Enemy spawners are network objects in their own right (rooms
            // instantiate them separately), so look at every spawned view.
            foreach (var v in spawned)
            {
                var cs = v.GetComponent<CreatureSpawner>();
                if (cs && cs.m_creaturePrefab) creatures.Add(cs.m_creaturePrefab.name);
                if (v.GetComponent<SpawnArea>()) creatures.Add("spawner:" + Utils.GetPrefabName(v.gameObject));
            }
            foreach (var dg in spawned.Select(v => v.GetComponent<DungeonGenerator>()).Where(d => d))
                foreach (var vg in dg.GetComponentsInChildren<Vegvisir>(false))
                    vegvisirs.AddRange(vg.m_locations.Select(l => l.m_locationName));

            // The generated layout as the generator saved it (room, position), so
            // seedgen's DungeonSim can be checked room by room.
            var rooms = new List<string>();
            string dgInfo = "";
            foreach (var dgv in spawned.Where(v => v.GetComponent<DungeonGenerator>()))
            {
                var dg = dgv.GetComponent<DungeonGenerator>();
                var p = dg.transform.position;
                dgInfo = $",\"dungeon\":{{\"seed\":{dg.m_generatedSeed},\"pos\":[{F(p.x)},{F(p.y)},{F(p.z)}]}}";
                if (!dgv.GetZDO().GetByteArray(ZDOVars.s_roomData, out var data)) continue;
                using var br = new BinaryReader(new MemoryStream(data));
                int n = br.ReadInt32();
                for (int i = 0; i < n; i++)
                {
                    int hash = br.ReadInt32();
                    float x = br.ReadSingle(), y = br.ReadSingle(), z = br.ReadSingle();
                    // Rotation is saved as euler angles (Utils.Write(Quaternion)).
                    br.ReadSingle(); float ry = br.ReadSingle(); br.ReadSingle();
                    var room = DungeonDB.instance.GetRoom(hash);
                    rooms.Add($"[\"{Escape(room != null ? room.m_prefab.Name : hash.ToString())}\",{F(x)},{F(y)},{F(z)},{F(ry)}]");
                }
            }

            foreach (var v in spawned) ZNetScene.instance.Destroy(v.gameObject);
            string rs = string.Join(",", present.GroupBy(x => x).OrderBy(g => g.Key)
                .Select(g => $"\"{Escape(g.Key)}\":{g.Count()}"));
            string cr = string.Join(",", creatures.GroupBy(x => x).OrderBy(g => g.Key)
                .Select(g => $"\"{Escape(g.Key)}\":{g.Count()}"));
            string vv = string.Join(",", vegvisirs.Distinct().Select(x => $"\"{Escape(x)}\""));
            return $"\"beehives\":{beehives},\"chests\":[{string.Join(",", chests.OrderBy(c => c, StringComparer.Ordinal))}],\"present\":{{{rs}}}," +
                   $"\"creatures\":{{{cr}}},\"vegvisirs\":[{vv}]" +
                   (rooms.Count > 0 ? $",\"rooms\":[{string.Join(",", rooms)}]" : "") + dgInfo;
        }

        var sb = new StringBuilder("[\n");
        int count = 0, rotDiffs = 0;
        foreach (var kv in zs.m_locationInstances.ToList())
        {
            var inst = kv.Value;
            if (inst.m_location == null) continue;
            string name = inst.m_location.m_prefab.Name ?? "";
            if (!LootPrefabs.Contains(name) && !name.StartsWith("WoodHouse")
                && !(dungeons && DungeonPrefabs.Contains(name))) continue;
            // Dev probes: VALHELP_LOOT_ONLY=Prefab1,Prefab2 samples just those.
            if (s_only != null && !s_only.Contains(name)) continue;

            int seed = wg.GetSeed() + kv.Key.x * 4271 + kv.Key.y * 9187;
            // Per-location cost, so the price of each dungeon type can be weighed.
            var one = Stopwatch.StartNew();
            string result = Sample(inst, seed, Quaternion.identity, out string objects);
            long ms = one.ElapsedMilliseconds;
            string rotField = "";
            if (checkRotation)
            {
                string rotated = Sample(inst, seed, Quaternion.Euler(0f, 90f, 0f), out _);
                bool same = rotated == result;
                if (!same) rotDiffs++;
                rotField = $",\"rotationStable\":{(same ? "true" : "false")}" +
                           (same ? "" : $",\"rotated\":{{{rotated}}}");
            }
            // Let Destroy()s actually run (they only free at end of frame) — after
            // every dungeon, which are heavy, but only every 25 ordinary locations,
            // since a dedicated server's frames are slow. Drop unused assets now
            // and then too.
            if (DungeonPrefabs.Contains(name) || count % 25 == 24) yield return null;
            if (count % 50 == 49) yield return Resources.UnloadUnusedAssets();

            sb.Append(count++ == 0 ? "" : ",\n")
              .Append($"{{\"prefab\":\"{Escape(name)}\",\"x\":{F(inst.m_position.x)},\"z\":{F(inst.m_position.z)},")
              .Append($"\"zone\":[{kv.Key.x},{kv.Key.y}],\"ms\":{ms},{result},\"objects\":{objects}{rotField}}}");
        }
        sb.Append("\n]\n");
        File.WriteAllText(path, sb.ToString());
        Log($"{Tag} loot: {count} locations" + (checkRotation ? $", {rotDiffs} changed under rotation" : ""));
    }

    /// <summary>
    /// Ground truth for drop-rate maths: every creature's <c>CharacterDrop</c> table
    /// plus everything that decides its star level — world spawns
    /// (<c>SpawnSystem</c>), alt-biome spawns and level-up multipliers, spawner
    /// prefabs (<c>SpawnArea</c>) and the <c>CreatureSpawner</c>s baked into
    /// locations along with each location's level overrides. Values are the raw
    /// serialized fields; the formulas that combine them live in the game
    /// (<c>CharacterDrop.GenerateDropList</c>, <c>SpawnSystem.GetLevelUpChance</c>).
    /// </summary>
    static void DumpDrops(string path)
    {
        string B(bool b) => b ? "true" : "false";
        string Name(GameObject go) => go ? Escape(go.name) : "";
        var sb = new StringBuilder("{\n");
        sb.Append($"\"version\":\"{Version.CurrentVersion}\",\"worldLevel\":{Game.m_worldLevel},")
          .Append($"\"enemyLevelUpRate\":{F(Game.m_enemyLevelUpRate)},")
          .Append($"\"worldLevelEnemyLevelUpExponent\":{F(Game.instance ? Game.instance.m_worldLevelEnemyLevelUpExponent : 0f)},\n");

        var prefabs = ZNetScene.instance.m_prefabs.Where(p => p).ToList();

        sb.Append("\"creatures\":[\n");
        int n = 0;
        foreach (var p in prefabs.OrderBy(p => p.name, StringComparer.Ordinal))
        {
            var cd = p.GetComponent<CharacterDrop>();
            var ch = p.GetComponent<Character>();
            if (!cd || !ch) continue;
            var drops = cd.m_drops.Where(d => d.m_prefab).Select(d =>
                $"{{\"item\":\"{Name(d.m_prefab)}\",\"min\":{d.m_amountMin},\"max\":{d.m_amountMax},\"chance\":{F(d.m_chance)}," +
                $"\"onePerPlayer\":{B(d.m_onePerPlayer)},\"levelMultiplier\":{B(d.m_levelMultiplier)}," +
                $"\"levelMultiplierNotAmount\":{B(d.m_levelMultiplierNotAmount)},\"dontScale\":{B(d.m_dontScale)}," +
                $"\"levels\":[{string.Join(",", Enumerable.Range(1, 3).Select(l => PseudoParams(d, l)))}]}}");
            sb.Append(n++ == 0 ? "" : ",\n")
              .Append($"{{\"prefab\":\"{Escape(p.name)}\",\"name\":\"{Escape(ch.m_name)}\",\"health\":{F(ch.m_health)},")
              .Append($"\"boss\":{B(ch.IsBoss())},\"drops\":[{string.Join(",", drops)}]}}");
        }
        sb.Append("\n],\n");

        string Spawn(SpawnSystem.SpawnData s, string source) =>
            $"{{\"source\":\"{Escape(source)}\",\"name\":\"{Escape(s.m_name)}\",\"prefab\":\"{Name(s.m_prefab)}\",\"enabled\":{B(s.m_enabled && !s.m_devDisabled)}," +
            $"\"biome\":\"{s.m_biome}\",\"biomeArea\":\"{s.m_biomeArea}\",\"minLevel\":{s.m_minLevel},\"maxLevel\":{s.m_maxLevel}," +
            $"\"levelUpMinCenterDistance\":{F(s.m_levelUpMinCenterDistance)},\"overrideLevelupChance\":{F(s.m_overrideLevelupChance)}," +
            $"\"maxSpawned\":{s.m_maxSpawned},\"spawnInterval\":{F(s.m_spawnInterval)},\"spawnChance\":{F(s.m_spawnChance)}," +
            $"\"groupSizeMin\":{s.m_groupSizeMin},\"groupSizeMax\":{s.m_groupSizeMax},\"requiredGlobalKey\":\"{Escape(s.m_requiredGlobalKey)}\"," +
            $"\"requiredEnvironments\":[{string.Join(",", s.m_requiredEnvironments.Select(e => $"\"{Escape(e)}\""))}]," +
            $"\"spawnAtDay\":{B(s.m_spawnAtDay)},\"spawnAtNight\":{B(s.m_spawnAtNight)},\"huntPlayer\":{B(s.m_huntPlayer)}," +
            $"\"minDistanceFromCenter\":{F(s.m_minDistanceFromCenter)},\"maxDistanceFromCenter\":{F(s.m_maxDistanceFromCenter)}}}";

        var ss = ZoneSystem.instance.m_zoneCtrlPrefab.GetComponent<SpawnSystem>();
        var spawns = ss.m_spawnLists.Where(l => l).SelectMany(l => l.m_spawners.Select(s => Spawn(s, l.name)))
            .Concat(AltBiomeList.m_altBiomes.SelectMany(a => a.m_spawn.Select(s => Spawn(s, "alt:" + a.m_name))));
        sb.Append("\"spawnSystem\":[\n").Append(string.Join(",\n", spawns)).Append("\n],\n");

        sb.Append("\"altBiomes\":[").Append(string.Join(",", AltBiomeList.m_altBiomes.Select(a =>
            $"{{\"name\":\"{Escape(a.m_name)}\",\"enabled\":{B(a.m_enabled)},\"biome\":\"{a.m_biome}\"," +
            $"\"levelUpChanceMultiplier\":{F(a.m_levelUpChanceMultiplier)}," +
            $"\"blockSpawnNames\":[{string.Join(",", a.m_blockSpawnNames.Select(x => $"\"{Escape(x)}\""))}]}}"))).Append("],\n");

        string Area(SpawnArea sa, string source) =>
            $"{{\"source\":\"{Escape(source)}\",\"levelupChance\":{F(sa.m_levelupChance)},\"maxNear\":{sa.m_maxNear},\"maxTotal\":{sa.m_maxTotal}," +
            $"\"spawnIntervalSec\":{F(sa.m_spawnIntervalSec)},\"prefabs\":[{string.Join(",", sa.m_prefabs.Where(d => d.m_prefab).Select(d =>
                $"{{\"prefab\":\"{Name(d.m_prefab)}\",\"weight\":{F(d.m_weight)},\"minLevel\":{d.m_minLevel},\"maxLevel\":{d.m_maxLevel}}}"))}]}}";
        sb.Append("\"spawnAreas\":[\n").Append(string.Join(",\n", prefabs
            .Select(p => (p, sa: p.GetComponent<SpawnArea>())).Where(t => t.sa)
            .OrderBy(t => t.p.name, StringComparer.Ordinal).Select(t => Area(t.sa, t.p.name)))).Append("\n],\n");

        // Location prefabs aren't in ZNetScene; load each just long enough to read
        // its spawners. Overrides on the Location root apply to every CreatureSpawner
        // whose m_spawnGroupID isn't excluded (CreatureSpawner.Spawn).
        sb.Append("\"locations\":[\n");
        n = 0;
        var seen = new HashSet<string>();
        foreach (var zl in ZoneSystem.instance.m_locations)
        {
            if (zl == null || !zl.m_prefab.IsValid || !seen.Add(zl.m_prefab.Name ?? zl.m_prefabName)) continue;
            zl.m_prefab.Load();
            try
            {
                var go = zl.m_prefab.Asset;
                if (!go) continue;
                var spawners = go.GetComponentsInChildren<CreatureSpawner>(true).Where(c => c.m_creaturePrefab).ToList();
                var areas = go.GetComponentsInChildren<SpawnArea>(true).ToList();
                if (spawners.Count == 0 && areas.Count == 0) continue;
                var loc = go.GetComponent<Location>();
                var cs = spawners.GroupBy(c => (Name(c.m_creaturePrefab), c.m_minLevel, c.m_maxLevel, c.m_levelupChance, c.m_spawnGroupID))
                    .OrderBy(g => g.Key.Item1, StringComparer.Ordinal).Select(g =>
                        $"{{\"prefab\":\"{g.Key.Item1}\",\"count\":{g.Count()},\"minLevel\":{g.Key.m_minLevel},\"maxLevel\":{g.Key.m_maxLevel}," +
                        $"\"levelupChance\":{F(g.Key.m_levelupChance)},\"spawnGroupID\":{g.Key.m_spawnGroupID}}}");
                sb.Append(n++ == 0 ? "" : ",\n")
                  .Append($"{{\"location\":\"{Escape(zl.m_prefab.Name ?? zl.m_prefabName)}\",\"enabled\":{B(zl.m_enable)},\"biome\":\"{zl.m_biome}\",\"quantity\":{zl.m_quantity},");
                if (loc)
                    sb.Append($"\"enemyMinLevelOverride\":{loc.m_enemyMinLevelOverride},\"enemyMaxLevelOverride\":{loc.m_enemyMaxLevelOverride}," +
                              $"\"enemyLevelUpOverride\":{F(loc.m_enemyLevelUpOverride)}," +
                              $"\"excludeEnemyLevelOverrideGroups\":[{string.Join(",", loc.m_excludeEnemyLevelOverrideGroups)}],");
                sb.Append($"\"creatureSpawners\":[{string.Join(",", cs)}],")
                  .Append($"\"spawnAreas\":[{string.Join(",", areas.Select(a => Area(a, a.name)))}]}}");
            }
            finally { zl.m_prefab.Release(); }
        }
        sb.Append("\n]\n}\n");
        File.WriteAllText(path, sb.ToString());
        Log($"{Tag} drops: {prefabs.Count(p => p.GetComponent<CharacterDrop>())} creatures, {n} locations with spawners");
    }

    /// <summary>
    /// The per-level numbers <c>CharacterDrop.GenerateDropList</c> derives from a
    /// drop, using the same float expressions so the runtime's own rounding
    /// decides them (e.g. whether <c>(int)(1f / 0.1f * 2f)</c> is 19 or 20).
    /// <c>key</c> is the <c>s_pseudoCounter</c> key; the first roll on a fresh key
    /// is <c>Range(0, firstRange)</c>, every reset after a drop <c>Range(0, firstRange + 2)</c>.
    /// </summary>
    static string PseudoParams(CharacterDrop.Drop drop, int level)
    {
        int mult = Mathf.Max(1, (int)Mathf.Pow(2f, level - 1));
        float num2 = drop.m_chance;
        if (drop.m_levelMultiplier) num2 *= (float)mult;
        bool pseudo = num2 <= 0.3f;
        int key = drop.m_prefab.name.GetStableHashCode() + (int)(num2 * 1000f);
        int firstRange = (int)(1f / num2 * 2f);
        return $"{{\"level\":{level},\"chance\":{F(num2)},\"pseudo\":{(pseudo ? "true" : "false")}," +
               $"\"key\":{key},\"firstRange\":{(pseudo ? firstRange : 0)}}}";
    }

    /// <summary>Locations whose contents seedgen reports, besides every WoodHouse.</summary>
    static readonly HashSet<string> LootPrefabs = new HashSet<string>
    {
        "Grave1", "TrollCave02", "GoblinCamp2", "StoneTowerRuins04",
        // Vegvisirs here are RandomSpawns (30-40%), so whether one exists is per instance.
        "Ruin2", "SwampRuin1", "SwampRuin2", "StoneHenge3", "StoneHenge4", "StoneHenge5",
    };

    /// <summary>
    /// Dungeon locations: sampling generates their whole interior (enemies,
    /// vegvisirs, chests), which is slow — only on oracle jobs or with
    /// VALHELP_LOOT_DUNGEONS=1.
    /// </summary>
    static readonly HashSet<string> s_only = Environment.GetEnvironmentVariable("VALHELP_LOOT_ONLY") is string only
        && only.Length > 0 ? new HashSet<string>(only.Split(',')) : null;

    static readonly HashSet<string> DungeonPrefabs = new HashSet<string>
    {
        "MountainCave02", "Mistlands_DvergrTownEntrance1", "Mistlands_DvergrTownEntrance2", "TheHole01",
    };

    static string F(float v) => v.ToString("R", CultureInfo.InvariantCulture);

    /// <summary>
    /// <c>Mathf.PerlinNoise</c> is a native <c>extern</c> InternalCall and the only
    /// part of the height chain not readable from IL, so it gets its own fixture.
    /// Inputs are written alongside outputs as (x, y, noise) triples — that way the
    /// comparer never has to reproduce the input generator, which would just be one
    /// more thing to get subtly wrong.
    /// </summary>
    static void WritePerlinFixture(string path)
    {
        const int steps = 256;
        var buf = new byte[steps * steps * 3 * 4];
        int o = 0;
        for (int i = 0; i < steps; i++)
        {
            for (int j = 0; j < steps; j++)
            {
                // Mix fine fractional steps with the large magnitudes worldgen
                // actually feeds it (coords offset by up to +/-10000), so the
                // fixture covers integer-boundary and precision-loss behaviour
                // rather than just [0,1).
                float x = i * 0.0625f + (i % 7) * 1000f;
                float y = j * 0.0625f + (j % 5) * 1234.5f;
                WriteFloat(buf, o, x); o += 4;
                WriteFloat(buf, o, y); o += 4;
                WriteFloat(buf, o, Mathf.PerlinNoise(x, y)); o += 4;
            }
        }
        WriteGz(path, buf);
    }

    void WriteMeta(string path, int seed)
    {
        // Hand-rolled: BepInEx plugins should not drag in a JSON dependency.
        string json =
            "{\n" +
            $"  \"seed\": {seed},\n" +
            $"  \"worldName\": \"{Escape(ZNet.World.m_name)}\",\n" +
            $"  \"worldSeedName\": \"{Escape(ZNet.World.m_seedName)}\",\n" +
            $"  \"worldGenVersion\": {ZNet.World.m_worldGenVersion},\n" +
            $"  \"gameVersion\": \"{Escape(Version.CurrentVersion.ToString())}\",\n" +
            $"  \"gridSize\": {GridSize},\n" +
            $"  \"pixelSize\": {PixelSize.ToString("R", CultureInfo.InvariantCulture)},\n" +
            "  \"layout\": \"row-major, index = i*gridSize + j, i = north axis (row 0 = south), world = (k - gridSize/2) * pixelSize + pixelSize/2\",\n" +
            "  \"files\": {\n" +
            "    \"oracle.height.f32.gz\": \"gzip float32[gridSize^2], GetBiomeHeight, raw world height\",\n" +
            "    \"oracle.biome.u8.gz\": \"gzip uint8[gridSize^2], Heightmap.BiomeIndex (0=None,1=Meadows,2=Swamp,3=Mountain,4=BlackForest,5=Plains,6=AshLands,7=DeepNorth,8=Ocean,9=Mistlands)\",\n" +
            "    \"oracle.forest.f32.gz\": \"gzip float32[gridSize^2], WorldGenerator.GetForestFactor\",\n" +
            "    \"oracle.perlin.f32.gz\": \"gzip float32[256*256*3], (x, y, Mathf.PerlinNoise(x,y)) triples\"\n" +
            "  }\n" +
            "}\n";
        File.WriteAllText(path, json);
    }

    static string Escape(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");

    /// <summary>Little-endian, matching BitConverter on every platform we target.</summary>
    static void WriteFloat(byte[] buf, int offset, float v)
    {
        var b = BitConverter.GetBytes(v);
        buf[offset] = b[0];
        buf[offset + 1] = b[1];
        buf[offset + 2] = b[2];
        buf[offset + 3] = b[3];
    }

    static void WriteGz(string path, byte[] data)
    {
        using (var fs = File.Create(path))
        using (var gz = new GZipStream(fs, CompressionMode.Compress))
            gz.Write(data, 0, data.Length);
    }

    /// <summary>
    /// Dense <c>Heightmap.BiomeIndex</c> from the sparse bitflag. Written out
    /// explicitly rather than via <c>BiomeHelpers.ToBiomeIndex</c> so the mapping
    /// is visible in the dump's own source and cannot drift silently.
    /// </summary>
    static int ToIndex(Heightmap.Biome b) => b switch
    {
        Heightmap.Biome.Meadows => 1,
        Heightmap.Biome.Swamp => 2,
        Heightmap.Biome.Mountain => 3,
        Heightmap.Biome.BlackForest => 4,
        Heightmap.Biome.Plains => 5,
        Heightmap.Biome.AshLands => 6,
        Heightmap.Biome.DeepNorth => 7,
        Heightmap.Biome.Ocean => 8,
        Heightmap.Biome.Mistlands => 9,
        _ => 0,
    };
}
