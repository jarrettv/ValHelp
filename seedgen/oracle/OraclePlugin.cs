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

            foreach (var v in spawned) ZNetScene.instance.Destroy(v.gameObject);
            string rs = string.Join(",", present.GroupBy(x => x).OrderBy(g => g.Key)
                .Select(g => $"\"{Escape(g.Key)}\":{g.Count()}"));
            string cr = string.Join(",", creatures.GroupBy(x => x).OrderBy(g => g.Key)
                .Select(g => $"\"{Escape(g.Key)}\":{g.Count()}"));
            string vv = string.Join(",", vegvisirs.Distinct().Select(x => $"\"{Escape(x)}\""));
            return $"\"beehives\":{beehives},\"chests\":[{string.Join(",", chests.OrderBy(c => c, StringComparer.Ordinal))}],\"present\":{{{rs}}}," +
                   $"\"creatures\":{{{cr}}},\"vegvisirs\":[{vv}]";
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

            int seed = wg.GetSeed() + kv.Key.x * 4271 + kv.Key.y * 9187;
            string result = Sample(inst, seed, Quaternion.identity, out string objects);
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
              .Append($"\"zone\":[{kv.Key.x},{kv.Key.y}],{result},\"objects\":{objects}{rotField}}}");
        }
        sb.Append("\n]\n");
        File.WriteAllText(path, sb.ToString());
        Log($"{Tag} loot: {count} locations" + (checkRotation ? $", {rotDiffs} changed under rotation" : ""));
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
