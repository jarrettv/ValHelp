using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Vh.World;

public record PoiLocation(
    string Name, string Type, float X, float Z,
    bool Checked = false, string? Prefab = null, string[]? Items = null,
    bool Generated = false);

/// <summary>
/// Replicates Valheim's ZoneSystem.GenerateLocations to find POI positions from a world seed.
/// Location parameters are extracted from the game's Unity prefab data.
/// </summary>
public static class LocationFinder
{
    const float ZoneSize = 64f;
    const float WorldRadius = 10000f; // locations only within this radius

    // Boss altar location configs (from game data, prioritized — placed first)
    static readonly LocationConfig[] BossLocations = new[]
    {
        // Eikthyr — Meadows (exterior=10, centerFirst, altitude 1+, forest 0-1.15, terrain delta 0-3)
        new LocationConfig("Eikthyrnir", "Boss Altar", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 3, true, true, false,
            0, 0, 1, 1000, true, 0, 1.15f, 300, 2000, 10, 0, 3, 1000, ""),

        // The Elder — Black Forest (exterior=25, altitude 1+, terrain delta 0-5)
        new LocationConfig("GDKing", "Boss Altar", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 4, true, false, false,
            0, 0, 1, 1000, false, 0, 1, 1000, 0, 25, 0, 5, 3000, ""),

        // Bonemass — Swamp (exterior=19.79, quantity=5, altitude 0+, terrain delta 0-4)
        new LocationConfig("Bonemass", "Boss Altar", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 5, true, false, false,
            0, 0, 0, 1000, false, 0, 1, 2000, 0, 19.79f, 0, 4, 3000, ""),

        // Moder — Mountain (exterior=12, altitude 150+, terrain delta 0-4)
        new LocationConfig("Dragonqueen", "Boss Altar", Biome.Mountain,
            WorldGenerator.BiomeArea.Everything, 3, true, false, false,
            0, 0, 150, 1000, false, 0, 1, 3000, 0, 12, 0, 4, 3000, ""),

        // Yagluth — Plains (exterior=32, altitude 1+, terrain delta 0-4)
        new LocationConfig("GoblinKing", "Boss Altar", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 4, true, false, false,
            0, 0, 1, 1000, false, 0, 1, 4000, 0, 32, 0, 4, 3000, ""),

        // The Queen — Mistlands (exterior=32, altitude 1+, terrain delta 0-40)
        new LocationConfig("Mistlands_DvergrBossEntrance1", "Boss Altar", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 5, true, false, false,
            0, 0, 1, 1000, false, 0, 1, 4000, 0, 32, 0, 40, 2048, ""),

        // Fader — Ashlands (exterior=32, altitude 1+, terrain delta 0-40)
        new LocationConfig("FaderLocation", "Boss Altar", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 5, true, false, false,
            0, 0, 1, 1000, false, 0, 1, 4000, 0, 32, 0, 40, 2048, ""),

        // Start temple (exterior=25, centerFirst, unique, altitude 3+, terrain delta 0-3)
        new LocationConfig("StartTemple", "Start", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 1, true, true, true,
            0, 0, 3, 30, true, 0, 1.15f, 0, 500, 25, 0, 3, 0, ""),

        // Haldor — Black Forest trader (exterior=10, unique, altitude 1+, forest 0-1.15, terrain delta 0-2)
        new LocationConfig("Vendor_BlackForest", "Trader", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 1, true, false, true,
            0, 0, 1, 1000, true, 0, 1.15f, 1500, 10000, 10, 0, 2, 0, ""),

        // Hildir — Meadows trader (exterior=10, unique, altitude 1+, forest 0-1.15, terrain delta 0-2)
        new LocationConfig("Hildir_camp", "Trader", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 1, true, false, true,
            0, 0, 1, 1000, true, 0, 1.15f, 1500, 10000, 10, 0, 2, 0, ""),

        // Bog Witch — Swamp trader (exterior=10, quantity=3, altitude 0+, terrain delta 0-4)
        new LocationConfig("BogWitch_Camp", "Trader", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 3, true, false, false,
            0, 0, 0, 1000, false, 0, 1, 1500, 10000, 10, 0, 4, 2048, ""),
    };

    // Meadows POI configs (non-prioritized — placed after bosses)
    // Parameters from Jotunn location list (Valheim 0.221.4)
    static readonly LocationConfig[] MeadowsLocations = new[]
    {
        // WoodHouse variants — abandoned houses, qty=20 each, forest threshold 0-1
        // Beehive is RandomSpawn (simulated per-instance).
        // Chests: WoodHouse2 has TreasureChest_meadows_02 (AxeHead2/Curious Axe Head),
        //         WoodHouse6 has TreasureChest_meadows_01 (AxeHead1/Mysterious Axe Head),
        //         WoodHouse 1,7,9,10,11,12,13 have TreasureChest_meadows (no axe heads),
        //         WoodHouse 3,4,5,8 have no chest.
        // Chest contents use DropTable weighted random — axe head has 2/8 = 25% chance per slot,
        // with 2-3 slots drawn (oneOfEach), so ~44-56% chance an axe head appears overall.
        new LocationConfig("WoodHouse1", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse2", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, "",
            ChestType: "TreasureChest_meadows_02"),
        new LocationConfig("WoodHouse3", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 10, 0, 4, 0, ""),
        new LocationConfig("WoodHouse4", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse5", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse6", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, "",
            ChestType: "TreasureChest_meadows_01"),
        new LocationConfig("WoodHouse7", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse8", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 10, 0, 4, 0, ""),
        new LocationConfig("WoodHouse9", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse10", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse11", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 4, 0, ""),
        new LocationConfig("WoodHouse12", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 6, 0, 4, 0, ""),
        new LocationConfig("WoodHouse13", "House", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 20, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 9, 0, 4, 0, ""),

        // Runestone_Boars — boar stone, qty=50, spawns boars nearby
        new LocationConfig("Runestone_Boars", "Runestone", Biome.Meadows,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, true, 0, 1, 0, 0, 8, 0, 3, 128, ""),

        // ShipWreck01-04 — coastal shipwrecks, qty=25 each, biome edge/median, terrain delta 0-10
        new LocationConfig("ShipWreck01", "Shipwreck", Biome.Swamp | Biome.BlackForest | Biome.Plains | Biome.Ocean,
            WorldGenerator.BiomeArea.Everything, 25, false, false, false,
            0, 0, -1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 1024, "Shipwreck"),
        new LocationConfig("ShipWreck02", "Shipwreck", Biome.Swamp | Biome.BlackForest | Biome.Plains | Biome.Ocean,
            WorldGenerator.BiomeArea.Everything, 25, false, false, false,
            0, 0, -1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 1024, "Shipwreck"),
        new LocationConfig("ShipWreck03", "Shipwreck", Biome.Swamp | Biome.BlackForest | Biome.Plains | Biome.Ocean,
            WorldGenerator.BiomeArea.Everything, 25, false, false, false,
            0, 0, -1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 1024, "Shipwreck"),
        new LocationConfig("ShipWreck04", "Shipwreck", Biome.Swamp | Biome.BlackForest | Biome.Plains | Biome.Ocean,
            WorldGenerator.BiomeArea.Everything, 25, false, false, false,
            0, 0, -1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 1024, "Shipwreck"),

        // Greydwarf_camp1 — greydwarf nest in Black Forest, qty=50, exterior=10, terrain delta 0-4
        new LocationConfig("Greydwarf_camp1", "GreydwarfNest", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 4, 128, ""),

        // TrollCave02 — troll cave in Black Forest, qty=50, exterior=10, terrain delta 0-10
        new LocationConfig("TrollCave02", "TrollCave", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 128, ""),

        // Crypt2 — burial chamber in Black Forest, qty=50, exterior=10, terrain delta 0-5
        new LocationConfig("Crypt2", "Crypt", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 5, 128, ""),

        // Crypt3 — burial chamber in Black Forest (variant), qty=50
        new LocationConfig("Crypt3", "Crypt", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 5, 128, ""),

        // Crypt4 — burial chamber in Black Forest (variant), qty=75
        new LocationConfig("Crypt4", "Crypt", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 75, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 5, 128, ""),

        // Ruin2 — Black Forest ruin with GDKing vegvisir, qty=200, inForest
        new LocationConfig("Ruin2", "RuinVegvisir", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 200, false, false, false,
            0, 0, 1, 1000, true, 0, 1.15f, 0, 0, 15, 0, 10, 128, ""),

        // SwampRuin1/2 — Swamp ruins with Bonemass vegvisir
        new LocationConfig("SwampRuin1", "SwampVegvisir", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 0, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("SwampRuin2", "SwampVegvisir", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 0, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // StoneTowerRuins04 — Mountain ruin with Moder vegvisir
        new LocationConfig("StoneTowerRuins04", "MountainVegvisir", Biome.Mountain,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // MountainCave02 — Mountain cave (Frost Cave)
        new LocationConfig("MountainCave02", "MountainCave", Biome.Mountain,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // DrakNest01 — Drake nest with dragon egg
        new LocationConfig("DrakeNest01", "DrakeNest", Biome.Mountain,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 10, 0, 10, 128, ""),

        // StoneTower1 / GoblinCamp2 — Plains totems
        new LocationConfig("StoneTower1", "Totem", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("GoblinCamp2", "Totem", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // Stonehenge3/4/5 — Plains ruins with GoblinKing vegvisir
        new LocationConfig("StoneHenge3", "PlainsVegvisir", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("StoneHenge4", "PlainsVegvisir", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("StoneHenge5", "PlainsVegvisir", Biome.Plains,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // SunkenCrypt4 — sunken crypt in Swamp, qty=75, exterior=10, terrain delta 0-5
        new LocationConfig("SunkenCrypt4", "SunkenCrypt", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 75, false, false, false,
            0, 0, 0, 1000, false, 0, 1, 0, 0, 10, 0, 5, 128, ""),

        // FireHole — swamp geyser/surtling spawner, qty=100, exterior=8, altitude 0-50, terrain delta 0-4
        new LocationConfig("FireHole", "Geyser", Biome.Swamp,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 0, 50, false, 0, 1, 0, 0, 8, 0, 4, 64, ""),

        // Mistlands_DvergrTownEntrance1/2 — infested mine in Mistlands, qty=75, exterior=32, altitude 1+, terrain delta 0-40
        new LocationConfig("Mistlands_DvergrTownEntrance1", "InfestedMine", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 75, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 32, 0, 40, 128, ""),
        new LocationConfig("Mistlands_DvergrTownEntrance2", "InfestedMine", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 75, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 32, 0, 40, 128, ""),

        // Mistlands_StatueGroup1 — ancient root in Mistlands, qty=100, exterior=15, altitude 1+, terrain delta 0-10
        new LocationConfig("Mistlands_StatueGroup1", "AncientRoot", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 100, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
    };

    static readonly Dictionary<string, string> FriendlyNames = new()
    {
        ["Eikthyrnir"] = "Eikthyr",
        ["GDKing"] = "The Elder",
        ["Bonemass"] = "Bonemass",
        ["Dragonqueen"] = "Moder",
        ["GoblinKing"] = "Yagluth",
        ["Mistlands_DvergrBossEntrance1"] = "The Queen",
        ["FaderLocation"] = "Fader",
        ["StartTemple"] = "Sacrificial Stones",
        ["Vendor_BlackForest"] = "Haldor",
        ["Hildir_camp"] = "Hildir",
        ["BogWitch_Camp"] = "Bog Witch",
        ["Runestone_Boars"] = "Boar Runestone",
        ["ShipWreck01"] = "Shipwreck",
        ["ShipWreck02"] = "Shipwreck",
        ["ShipWreck03"] = "Shipwreck",
        ["ShipWreck04"] = "Shipwreck",
        ["Greydwarf_camp1"] = "Greydwarf Nest",
        ["TrollCave02"] = "Troll Cave",
        ["Crypt2"] = "Burial Chamber",
        ["Crypt3"] = "Burial Chamber",
        ["Crypt4"] = "Burial Chamber",
        ["SunkenCrypt4"] = "Sunken Crypt",
        ["FireHole"] = "Geyser",
        ["Ruin2"] = "Elder Vegvisir Ruin",
        ["SwampRuin1"] = "Bonemass Vegvisir",
        ["SwampRuin2"] = "Bonemass Vegvisir",
        ["StoneTowerRuins04"] = "Moder Vegvisir",
        ["MountainCave02"] = "Frost Cave",
        ["DrakeNest01"] = "Drake Nest",
        ["StoneTower1"] = "Fuling Totem",
        ["GoblinCamp2"] = "Fuling Totem",
        ["StoneHenge3"] = "Yagluth Vegvisir",
        ["StoneHenge4"] = "Yagluth Vegvisir",
        ["StoneHenge5"] = "Yagluth Vegvisir",
        ["Mistlands_DvergrTownEntrance1"] = "Infested Mine",
        ["Mistlands_DvergrTownEntrance2"] = "Infested Mine",
        ["Mistlands_StatueGroup1"] = "Ancient Root",
        ["WoodHouse1"] = "WoodHouse1",
        ["WoodHouse2"] = "WoodHouse2",
        ["WoodHouse3"] = "WoodHouse3",
        ["WoodHouse4"] = "WoodHouse4",
        ["WoodHouse5"] = "WoodHouse5",
        ["WoodHouse6"] = "WoodHouse6",
        ["WoodHouse7"] = "WoodHouse7",
        ["WoodHouse8"] = "WoodHouse8",
        ["WoodHouse9"] = "WoodHouse9",
        ["WoodHouse10"] = "WoodHouse10",
        ["WoodHouse11"] = "WoodHouse11",
        ["WoodHouse12"] = "WoodHouse12",
        ["WoodHouse13"] = "WoodHouse13",
    };

    /// <summary>
    /// Read boss locations from a world .db save file by scanning for known prefab name patterns.
    /// Returns null if the file doesn't exist or no locations found.
    /// </summary>
    public static List<PoiLocation>? ReadFromWorldDb(string dbPath, int worldSeed = 0)
    {
        if (!File.Exists(dbPath)) return null;

        byte[] data;
        try { data = File.ReadAllBytes(dbPath); }
        catch { return null; }

        var results = new List<PoiLocation>();
        foreach (var (prefabName, friendly) in FriendlyNames)
        {
            byte[] nameBytes = Encoding.UTF8.GetBytes(prefabName);
            // BinaryWriter writes strings as 7-bit encoded length + UTF8 bytes
            // For strings < 128 chars, length is a single byte
            byte[] needle = new byte[1 + nameBytes.Length];
            needle[0] = (byte)nameBytes.Length;
            Array.Copy(nameBytes, 0, needle, 1, nameBytes.Length);

            // Look up config for type and items
            var cfg = AllLocations.FirstOrDefault(c => c.PrefabName == prefabName);
            string type = cfg?.Type ?? (prefabName == "StartTemple" ? "Start" : "Boss Altar");

            int pos = 0;
            while (true)
            {
                pos = FindBytes(data, needle, pos);
                if (pos < 0) break;

                int after = pos + needle.Length;
                if (after + 13 <= data.Length)
                {
                    float x = BitConverter.ToSingle(data, after);
                    float y = BitConverter.ToSingle(data, after + 4);
                    float z = BitConverter.ToSingle(data, after + 8);

                    // Sanity check coordinates
                    if (Math.Abs(x) < 20000 && Math.Abs(z) < 20000 && Math.Abs(y) < 1000)
                    {
                        // The byte before the length prefix is the 'generated' flag
                        // (0x01 = zone visited and location spawned, 0x00 = candidate only)
                        bool generated = pos > 0 && data[pos - 1] == 0x01;

                        // Simulate RandomSpawn + chest loot at real positions
                        string[]? items = cfg?.StaticItems;
                        if (worldSeed != 0 && PrefabSpawnData.ContainsKey(prefabName))
                        {
                            var rngState = UnityRandom.GetState();
                            var simItems = SimulateRandomSpawns(prefabName, worldSeed, x, z,
                                cfg?.ChestType);
                            var (a, b, c, d) = rngState;
                            UnityRandom.SetState(a, b, c, d);
                            if (simItems.Count > 0)
                                items = simItems.ToArray();
                        }

                        // For houses, only include if they have interesting items
                        if (type == "House" && (items == null || items.Length == 0))
                        {
                            pos++;
                            continue;
                        }

                        results.Add(new PoiLocation(friendly, type, x, z,
                            Prefab: prefabName, Items: items, Generated: generated));
                    }
                }
                pos++;
            }
        }

        return results.Count > 0 ? results : null;
    }

    static int FindBytes(byte[] haystack, byte[] needle, int start)
    {
        int end = haystack.Length - needle.Length;
        for (int i = start; i <= end; i++)
        {
            bool match = true;
            for (int j = 0; j < needle.Length; j++)
            {
                if (haystack[i + j] != needle[j]) { match = false; break; }
            }
            if (match) return i;
        }
        return -1;
    }

    // All location configs combined: prioritized first, then non-prioritized
    static readonly LocationConfig[] AllLocations =
        BossLocations.Concat(MeadowsLocations).ToArray();

    /// <summary>
    /// Find all known locations (bosses + meadows POIs) from world seed.
    /// Processes prioritized locations first, matching the game's placement order.
    /// Simulates RandomSpawn rolls to determine per-instance items (beehive, etc.).
    /// </summary>
    public static List<PoiLocation> FindLocations(WorldGenerator wg)
    {
        var results = new List<PoiLocation>();
        var placed = new Dictionary<string, List<(float x, float z)>>();

        // Process prioritized first, then non-prioritized (matches game order)
        var ordered = AllLocations
            .OrderByDescending(l => l.Prioritized)
            .ToArray();

        // Save/restore RNG state — GenerateLocation uses the global UnityRandom
        // and we must not disturb its sequence between location types.
        foreach (var loc in ordered)
        {
            if (!placed.ContainsKey(loc.PrefabName))
                placed[loc.PrefabName] = new List<(float, float)>();

            var found = GenerateLocation(wg, loc, placed);
            // Snapshot RNG state after placement (before RandomSpawn simulation)
            var rngState = UnityRandom.GetState();

            string friendly = FriendlyNames.GetValueOrDefault(loc.PrefabName, loc.PrefabName);
            foreach (var (x, z) in found)
            {
                // Build per-instance items: static items + RandomSpawn results + chest loot
                var randomItems = SimulateRandomSpawns(loc.PrefabName, wg.GetSeed(), x, z,
                    loc.ChestType);
                string[]? items = null;
                int staticCount = loc.StaticItems?.Length ?? 0;
                int totalCount = staticCount + randomItems.Count;
                if (totalCount > 0)
                {
                    items = new string[totalCount];
                    if (loc.StaticItems != null)
                        Array.Copy(loc.StaticItems, items, staticCount);
                    for (int ri = 0; ri < randomItems.Count; ri++)
                        items[staticCount + ri] = randomItems[ri];
                }

                // Only include houses that have interesting items (beehive, axe heads)
                if (loc.Type == "House" && (items == null || items.Length == 0))
                    continue;

                results.Add(new PoiLocation(friendly, loc.Type, x, z,
                    Prefab: loc.PrefabName, Items: items));
            }

            // Restore RNG state so the next GenerateLocation call is unaffected
            var (a, b, c, d) = rngState;
            UnityRandom.SetState(a, b, c, d);
        }

        return results;
    }

    /// <summary>Backward-compatible wrapper — finds boss locations only.</summary>
    public static List<PoiLocation> FindBossLocations(WorldGenerator wg)
        => FindLocations(wg);

    internal static bool DebugTrace = false;

    private static List<(float x, float z)> GenerateLocation(
        WorldGenerator wg, LocationConfig loc,
        Dictionary<string, List<(float x, float z)>> allPlaced)
    {
        var found = new List<(float x, float z)>();
        int seed = wg.GetSeed() + StableHash.GetStableHashCode(loc.PrefabName);
        UnityRandom.InitState(seed);

        int attempts = loc.Prioritized ? 200000 : 100000;
        float maxRange = WorldRadius;
        if (loc.CenterFirst)
            maxRange = loc.MinDist;

        int placedCount = 0;
        int debugPlaceCount = 0;

        for (int i = 0; i < attempts && placedCount < loc.Quantity; i++)
        {
            var rngBefore = UnityRandom.GetState();
            var zoneID = GetRandomZone(maxRange);
            if (loc.CenterFirst)
                maxRange += 1f;
            if (DebugTrace && loc.PrefabName == "Eikthyrnir" && debugPlaceCount < 5)
            {
                var (s0,s1,s2,s3) = rngBefore;
                Console.Error.WriteLine($"[EIK] i={i} zone=({zoneID.x},{zoneID.y}) rng_before=({s0},{s1},{s2},{s3})");
            }

            // Check if zone already has a location
            bool zoneUsed = false;
            foreach (var kvp in allPlaced)
                foreach (var (px, pz) in kvp.Value)
                {
                    int zx = FloorToInt((px + 32f) / 64f);
                    int zy = FloorToInt((pz + 32f) / 64f);
                    if (zx == zoneID.x && zy == zoneID.y) { zoneUsed = true; break; }
                }
            if (zoneUsed) continue;

            float zonePosX = zoneID.x * ZoneSize;
            float zonePosZ = zoneID.y * ZoneSize;

            // Biome area check
            var biomeArea = wg.GetBiomeArea(zonePosX, zonePosZ);
            if ((loc.BiomeArea & biomeArea) == 0) continue;

            for (int j = 0; j < 20; j++)
            {
                float maxR = Math.Max(loc.ExteriorRadius, 0);
                float rx = UnityRandom.Range(-32f + maxR, 32f - maxR);
                float rz = UnityRandom.Range(-32f + maxR, 32f - maxR);
                float px2 = zonePosX + rx;
                float pz2 = zonePosZ + rz;

                float magnitude = MathF.Sqrt(px2 * px2 + pz2 * pz2);

                // Min/max distance from world center
                if (loc.MinDist != 0 && magnitude < loc.MinDist) continue;
                if (loc.MaxDist != 0 && magnitude > loc.MaxDist) continue;

                // Biome check
                Biome biome = wg.GetBiome(px2, pz2);
                if ((loc.Biome & biome) == 0) continue;

                // Altitude check
                float height = wg.GetHeight(px2, pz2, out float maskA);
                float alt = height - 30f;
                if (alt < loc.MinAlt || alt > loc.MaxAlt) continue;

                // Forest check
                if (loc.InForest)
                {
                    float ff = WorldGenerator.GetForestFactor(new Vector3(px2, 0, pz2));
                    if (ff < loc.ForestMin || ff > loc.ForestMax) continue;
                }

                // Distance from center check
                if (loc.MinDistCenter > 0 && magnitude < loc.MinDistCenter) continue;
                if (loc.MaxDistCenter > 0 && magnitude > loc.MaxDistCenter) continue;

                // Terrain delta check
                wg.GetTerrainDelta(px2, pz2, loc.ExteriorRadius, out float delta);
                if (delta > loc.MaxTerrainDelta || delta < loc.MinTerrainDelta) continue;

                // Min distance from similar — checks same prefab, or same group if set
                if (loc.MinDistSimilar > 0)
                {
                    bool tooClose = false;
                    foreach (var kvp in allPlaced)
                    {
                        // Check same prefab, or same group if both share a non-empty group
                        bool sameGroup = kvp.Key == loc.PrefabName;
                        if (!sameGroup && loc.Group.Length > 0)
                        {
                            var otherCfg = AllLocations.FirstOrDefault(c => c.PrefabName == kvp.Key);
                            sameGroup = otherCfg?.Group == loc.Group;
                        }
                        if (!sameGroup) continue;

                        foreach (var (sx, sz) in kvp.Value)
                        {
                            float dx = px2 - sx, dz = pz2 - sz;
                            if (MathF.Sqrt(dx * dx + dz * dz) < loc.MinDistSimilar)
                            { tooClose = true; break; }
                        }
                        if (tooClose) break;
                    }
                    if (tooClose) continue;
                }

                // Success!
                found.Add((px2, pz2));
                allPlaced[loc.PrefabName].Add((px2, pz2));
                placedCount++;
                if (DebugTrace && loc.PrefabName == "Eikthyrnir" && debugPlaceCount < 5)
                {
                    Console.Error.WriteLine($"[EIK] PLACED #{debugPlaceCount} at ({px2:F1},{pz2:F1}) iter={i} j={j} h={height:F4} delta={delta:F4}");
                    debugPlaceCount++;
                }
                break;
            }
        }

        return found;
    }

    private static (int x, int y) GetRandomZone(float range)
    {
        int num = (int)range / 64;
        int x, y;
        do
        {
            x = UnityRandom.Range(-num, num);
            y = UnityRandom.Range(-num, num);
        } while (MathF.Sqrt((x * ZoneSize) * (x * ZoneSize) + (y * ZoneSize) * (y * ZoneSize)) >= WorldRadius);
        return (x, y);
    }

    static int FloorToInt(float f) => (int)MathF.Floor(f);

    /// <summary>Serialize POI list to a JSON string (for DB storage or file output).</summary>
    public static string ToJsonString(List<PoiLocation> pois)
    {
        var sb = new StringBuilder();
        sb.AppendLine("[");
        for (int i = 0; i < pois.Count; i++)
        {
            var p = pois[i];
            sb.Append($"  {{ \"name\": \"{Escape(p.Name)}\", \"type\": \"{Escape(p.Type)}\"");
            if (p.Prefab != null) sb.Append($", \"prefab\": \"{Escape(p.Prefab)}\"");
            sb.Append($", \"x\": {p.X:F1}, \"z\": {p.Z:F1}");
            if (p.Checked) sb.Append(", \"checked\": true");
            if (p.Items is { Length: > 0 })
            {
                sb.Append(", \"items\": [");
                sb.Append(string.Join(", ", p.Items.Select(it => $"\"{Escape(it)}\"")));
                sb.Append(']');
            }
            sb.Append(" }");
            sb.AppendLine(i < pois.Count - 1 ? "," : "");
        }
        sb.AppendLine("]");
        return sb.ToString();
    }

    public static void WriteJson(List<PoiLocation> pois, string path)
    {
        File.WriteAllText(path, ToJsonString(pois));
    }

    /// <summary>Parse POI list from a JSON string (from DB cache).</summary>
    public static List<PoiLocation>? ReadJsonString(string json)
    {
        return ParsePoiLines(json.Split('\n'));
    }

    public static List<PoiLocation>? ReadJson(string path)
    {
        if (!File.Exists(path)) return null;
        return ParsePoiLines(File.ReadAllLines(path));
    }

    private static List<PoiLocation>? ParsePoiLines(IEnumerable<string> lines)
    {
        var pois = new List<PoiLocation>();
        foreach (string line in lines)
        {
            string trimmed = line.Trim().TrimEnd(',');
            if (!trimmed.StartsWith("{")) continue;
            string? name = ExtractJsonString(trimmed, "name");
            string? type = ExtractJsonString(trimmed, "type");
            string? prefab = ExtractJsonString(trimmed, "prefab");
            float? x = ExtractJsonFloat(trimmed, "x");
            float? z = ExtractJsonFloat(trimmed, "z");
            if (name != null && type != null && x.HasValue && z.HasValue)
            {
                bool chk = trimmed.Contains("\"checked\": true");
                string[]? items = ExtractJsonStringArray(trimmed, "items");
                pois.Add(new PoiLocation(name, type, x.Value, z.Value, chk, prefab, items));
            }
        }
        return pois.Count > 0 ? pois : null;
    }

    static string? ExtractJsonString(string json, string key)
    {
        string pattern = $"\"{key}\": \"";
        int start = json.IndexOf(pattern);
        if (start < 0) return null;
        start += pattern.Length;
        int end = json.IndexOf('"', start);
        return end < 0 ? null : json.Substring(start, end - start).Replace("\\\"", "\"").Replace("\\\\", "\\");
    }

    static float? ExtractJsonFloat(string json, string key)
    {
        string pattern = $"\"{key}\": ";
        int start = json.IndexOf(pattern);
        if (start < 0) return null;
        start += pattern.Length;
        int end = start;
        while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '.' || json[end] == '-'))
            end++;
        return float.TryParse(json.Substring(start, end - start), System.Globalization.CultureInfo.InvariantCulture, out float val) ? val : null;
    }

    /// <summary>Parse a simple JSON string array like ["a", "b"].</summary>
    static string[]? ExtractJsonStringArray(string json, string key)
    {
        string pattern = $"\"{key}\": [";
        int start = json.IndexOf(pattern);
        if (start < 0) return null;
        start += pattern.Length;
        int end = json.IndexOf(']', start);
        if (end < 0) return null;
        string inner = json.Substring(start, end - start).Trim();
        if (inner.Length == 0) return null;
        var items = new List<string>();
        int pos = 0;
        while (pos < inner.Length)
        {
            int q1 = inner.IndexOf('"', pos);
            if (q1 < 0) break;
            int q2 = inner.IndexOf('"', q1 + 1);
            if (q2 < 0) break;
            items.Add(inner.Substring(q1 + 1, q2 - q1 - 1).Replace("\\\"", "\"").Replace("\\\\", "\\"));
            pos = q2 + 1;
        }
        return items.Count > 0 ? items.ToArray() : null;
    }

    static string Escape(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    // --- RandomSpawn + chest loot simulation ---
    //
    // ZoneSystem.SpawnLocation execution order (confirmed from decompiled code):
    //   1. Random.InitState(worldSeed + zoneID.x*4271 + zoneID.y*9187)
    //   2. Iterate ALL RandomSpawn components → each consumes Range(0f, 100f)
    //      Objects failing the roll are deactivated on the prefab template.
    //   3. Iterate ZNetView[] → Instantiate each ACTIVE one.
    //      Container.Awake() fires synchronously during Instantiate,
    //      calling AddDefaultItems() → DropTable.GetDropListItems(),
    //      which continues consuming from the SAME seeded RNG.
    //
    // This means chest contents are FULLY DETERMINISTIC from world seed + zone position.

    // Per-prefab data: total RandomSpawn count + tracked items + chest info
    record PrefabSpawnInfo(
        int TotalRandomSpawns,                                         // total RS components in prefab
        (string Item, int Index, float Chance)[] TrackedSpawns,        // RS items we care about
        ChestInfo? Chest);                                             // null = no special chest

    record ChestInfo(
        bool IsRandomSpawn,      // true = chest itself is a RandomSpawn
        int RsIndex,             // RandomSpawn index (only if IsRandomSpawn)
        float RsChance,          // m_chanceToSpawn (only if IsRandomSpawn)
        string AxeHeadItem,      // friendly name of the axe head
        string AxeHeadPrefab,    // prefab name (AxeHead1 / AxeHead2)
        float AxeHeadWeight,     // weight in DropTable (2.0)
        float TotalWeight,       // sum of all weights (8.0)
        int WearNTearBefore,     // # of non-conditional WearNTear before chest
        (int Index, float Chance)[] VineGroups,  // RS vine groups that add WNT if survived
        int WntPerVineGroup);                     // WNT pieces added per surviving vine group
    // WearNTear.Awake() consumes 2 RNG calls when m_applyRandomDamage=true:
    //   Range(0f, 4f) for m_updateCoverTimer (always)
    //   Range(0.1*hp, 0.6*hp) for initial damage (when m_randomInitialDamage && hp==default)
    // Both WoodHouse2 and WoodHouse6 have m_applyRandomDamage=true.
    // Container.Awake fires BEFORE WearNTear.Awake on the same GameObject,
    // so the chest's own WearNTear does not interfere.
    // DropTable shared by both chest types: dropChance=1.0, dropMin=2, dropMax=3, oneOfEach=true
    // Items: Feathers(w1,1-3), Coins(w1,5-15), Amber(w1,1-1), ArrowFlint(w1,10-20),
    //        Torch(w1,1-1), Flint(w1,2-4), AxeHead(w2,1-1)

    static readonly DropItem[] MeadowsChestDrops = new[]
    {
        new DropItem("Feathers",   1f, 1, 3),
        new DropItem("Coins",      1f, 5, 15),
        new DropItem("Amber",      1f, 1, 1),
        new DropItem("ArrowFlint", 1f, 10, 20),
        new DropItem("Torch",      1f, 1, 1),
        new DropItem("Flint",      1f, 2, 4),
    };
    record DropItem(string Name, float Weight, int StackMin, int StackMax);

    // Total RandomSpawn counts and beehive indices cross-referenced against game simulation ground truth.
    // All beehives have m_chanceToSpawn=25. WoodHouse8/12 have no beehive.
    static readonly Dictionary<string, PrefabSpawnInfo> PrefabSpawnData = new()
    {
        ["WoodHouse1"]  = new(50, new[] { ("Beehive",  1, 25f) }, null),
        ["WoodHouse2"]  = new(67,
            new[] { ("Beehive", 49, 25f), ("Chest", 50, 50f) },
            new ChestInfo(true, 50, 50f, "Curious Axe Head", "AxeHead2", 2f, 8f,
                WearNTearBefore: 61,    // 61 non-conditional WearNTear ZNetViews before chest
                VineGroups: new[] { (0, 10f), (5, 10f), (11, 10f) },  // 3 vine groups before chest (10% each)
                WntPerVineGroup: 2)),  // each surviving vine group adds 2 WNT pieces
        ["WoodHouse3"]  = new(30, new[] { ("Beehive", 28, 25f) }, null),
        ["WoodHouse4"]  = new(30, new[] { ("Beehive",  5, 25f) }, null),
        ["WoodHouse5"]  = new(26, new[] { ("Beehive",  6, 25f) }, null),
        ["WoodHouse6"]  = new(30,
            new[] { ("Beehive", 1, 25f) },
            new ChestInfo(false, 0, 0f, "Mysterious Axe Head", "AxeHead1", 2f, 8f,
                WearNTearBefore: 29,    // 29 non-conditional WearNTear ZNetViews before chest
                VineGroups: Array.Empty<(int, float)>(),
                WntPerVineGroup: 0)),  // no conditional vine groups
        ["WoodHouse7"]  = new(63, new[] { ("Beehive", 14, 25f) }, null),
        // WoodHouse8: 42 RandomSpawns, no beehive, no special chest
        ["WoodHouse9"]  = new(62, new[] { ("Beehive", 14, 25f) }, null),
        ["WoodHouse10"] = new(46, new[] { ("Beehive", 15, 25f) }, null),
        ["WoodHouse11"] = new(64, new[] { ("Beehive", 23, 25f) }, null),
        // WoodHouse12: 24 RandomSpawns, no beehive, no special chest
        ["WoodHouse13"] = new(47, new[] { ("Beehive",  9, 25f) }, null),

        // TrollCave02: 7 RandomSpawns. Troll (SpawnOnce) at index 0, 33% chance.
        ["TrollCave02"] = new(7, new[] { ("Troll", 0, 33f) }, null),

        // GoblinCamp2: 1 RandomSpawn. GoblinTotem at index 0, 50% chance.
        ["GoblinCamp2"] = new(1, new[] { ("GoblinTotem", 0, 50f) }, null),

        // StoneTowerRuins04: 15 RandomSpawns. Vegvisir_DragonQueen at index 4, 70% chance.
        ["StoneTowerRuins04"] = new(15, new[] { ("ModerVegvisir", 4, 70f) }, null),
    };

    /// <summary>
    /// Simulate Valheim's RandomSpawn rolls and chest DropTable for a placed location.
    /// Returns items that spawned/dropped at this position — fully deterministic from seed.
    /// </summary>
    static List<string> SimulateRandomSpawns(string prefabName, int worldSeed, float x, float z,
        string? chestType)
    {
        var spawned = new List<string>();
        if (!PrefabSpawnData.TryGetValue(prefabName, out var info))
            return spawned;

        // Compute zoneID from world position
        int zoneX = FloorToInt((x + 32f) / 64f);
        int zoneY = FloorToInt((z + 32f) / 64f);

        // Seed the RNG for this location instance (game formula)
        int seed = worldSeed + zoneX * 4271 + zoneY * 9187;
        UnityRandom.InitState(seed);

        // Build lookup for tracked RandomSpawn indices
        var itemAt = new Dictionary<int, (string Item, float Chance)>();
        foreach (var (item, idx, chance) in info.TrackedSpawns)
            itemAt[idx] = (item, chance);

        // Phase 1: Roll ALL RandomSpawn children (consuming Range(0,100) for each)
        // Track which vine groups survived (they add WearNTear calls in the Instantiate loop)
        bool chestSurvived = info.Chest != null && !info.Chest.IsRandomSpawn; // always-present chest
        int survivedVineGroups = 0;

        // Build vine group lookup: RS index → chance
        Dictionary<int, float>? vineChances = null;
        if (info.Chest?.VineGroups is { Length: > 0 })
        {
            vineChances = new Dictionary<int, float>();
            foreach (var (vIdx, vChance) in info.Chest.VineGroups)
                vineChances[vIdx] = vChance;
        }

        for (int i = 0; i < info.TotalRandomSpawns; i++)
        {
            float roll = UnityRandom.Range(0f, 100f);
            if (itemAt.TryGetValue(i, out var entry))
            {
                if (roll <= entry.Chance)
                {
                    if (entry.Item == "Chest")
                        chestSurvived = true;
                    else
                        spawned.Add(entry.Item);
                }
            }
            // Check if this RS index is a vine group parent
            if (vineChances != null && vineChances.TryGetValue(i, out float vineChance))
            {
                if (roll <= vineChance)
                    survivedVineGroups++;
            }
        }

        // Phase 2: Simulate the Instantiate loop's RNG consumption before the chest.
        // Each WearNTear.Awake() consumes 2 Random calls (m_applyRandomDamage=true):
        //   Range(0f, 4f) for cover timer + Range(0.1*hp, 0.6*hp) for initial damage.
        // Container.Awake fires BEFORE WearNTear on the chest's own GameObject.
        if (chestSurvived && info.Chest != null)
        {
            var chest = info.Chest;
            int totalWnt = chest.WearNTearBefore + survivedVineGroups * chest.WntPerVineGroup;
            for (int w = 0; w < totalWnt; w++)
            {
                UnityRandom.Range(0f, 4f);     // m_updateCoverTimer
                UnityRandom.Range(0f, 1f);     // initial damage (Range(0.1*hp, 0.6*hp))
            }

            var lootItems = SimulateDropTable(chest);
            bool hasAxeHead = false;
            foreach (var item in lootItems)
            {
                if (item == chest.AxeHeadPrefab)
                    hasAxeHead = true;
            }
            if (hasAxeHead)
                spawned.Add(chest.AxeHeadItem);
            else
                spawned.Add($"Chest (no {chest.AxeHeadItem})");
        }

        return spawned;
    }

    /// <summary>
    /// Simulate DropTable.GetDropListItems() using the current UnityRandom state.
    /// Matches the exact game algorithm: dropChance check, pick count, weighted selection
    /// with oneOfEach removal, and stack size rolls.
    /// </summary>
    static List<string> SimulateDropTable(ChestInfo chest)
    {
        var result = new List<string>();

        // 1. dropChance check: Random.value > m_dropChance → early return
        //    dropChance=1.0, so this always passes, but still consumes one RNG call
        float dropCheck = UnityRandom.Value();
        if (dropCheck > 1.0f) return result; // never true for dropChance=1.0

        // 2. Build mutable drop list with weights
        var drops = new List<(string Name, float Weight, int StackMin, int StackMax)>();
        float totalWeight = 0f;
        foreach (var d in MeadowsChestDrops)
        {
            drops.Add((d.Name, d.Weight, d.StackMin, d.StackMax));
            totalWeight += d.Weight;
        }
        // Add the axe head entry
        drops.Add((chest.AxeHeadPrefab, chest.AxeHeadWeight, 1, 1));
        totalWeight += chest.AxeHeadWeight;

        // 3. Pick number of items: Random.Range(dropMin, dropMax+1) = Range(2, 4)
        int numItems = UnityRandom.Range(2, 4); // 2 or 3

        // 4. For each item pick: weighted random selection
        for (int i = 0; i < numItems && drops.Count > 0; i++)
        {
            float roll = UnityRandom.Range(0f, totalWeight);
            string picked = drops[0].Name; // fallback
            int pickedIdx = 0;

            float cumulative = 0f;
            for (int d = 0; d < drops.Count; d++)
            {
                cumulative += drops[d].Weight;
                if (roll <= cumulative)
                {
                    picked = drops[d].Name;
                    pickedIdx = d;
                    break;
                }
            }

            result.Add(picked);

            // AddItemToList consumes Random.Range(stackMin, stackMax+1) for stack size
            UnityRandom.Range(drops[pickedIdx].StackMin, drops[pickedIdx].StackMax + 1);

            // oneOfEach: remove picked item and reduce weight
            totalWeight -= drops[pickedIdx].Weight;
            drops.RemoveAt(pickedIdx);
        }

        return result;
    }

    record LocationConfig(
        string PrefabName, string Type, Biome Biome, WorldGenerator.BiomeArea BiomeArea,
        int Quantity, bool Prioritized, bool CenterFirst, bool Unique,
        float MinDist, float MaxDist, float MinAlt, float MaxAlt,
        bool InForest, float ForestMin, float ForestMax,
        float MinDistCenter, float MaxDistCenter, float ExteriorRadius,
        float MinTerrainDelta, float MaxTerrainDelta, float MinDistSimilar, string Group,
        string[]? StaticItems = null, string? ChestType = null);
}
