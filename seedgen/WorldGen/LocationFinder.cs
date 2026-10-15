using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;


namespace Vh.World;

public record PoiLocation(
    string Name, string Type, float X, float Z,
    bool Checked = false, string? Prefab = null, string[]? Items = null,
    bool Generated = false, string? Biome = null, ChestItem[][]? Chests = null,
    IReadOnlyDictionary<string, int>? Creatures = null, string[]? Vegvisirs = null);

/// <summary>One stack in one of a location's chests, as the game rolled it.</summary>
public record ChestItem(string Item, int Count);

/// <summary>
/// What the game actually spawned for one location instance, from the oracle
/// plugin's <c>oracle.loot.json</c> (see seedgen/oracle). Ground truth: the plugin
/// spawns the location through <c>ZoneSystem.SpawnLocation</c> with the seed a
/// player's first visit uses.
/// </summary>
public record LootSample(
    string Prefab, float X, float Z, int Beehives, ChestItem[][] Chests,
    IReadOnlyDictionary<string, int> Objects, IReadOnlyDictionary<string, int> Present,
    IReadOnlyDictionary<string, int> Creatures, string[] Vegvisirs);

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

        // Kall Fimbulbringer — Deep North (prefab "DN_Bossroom" in 1.0).
        // exterior=32, altitude 80+ (it sits high), terrain delta 0-6, 1024 apart.
        new LocationConfig("DN_Bossroom", "Boss Altar", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 3, true, false, false,
            0, 0, 80, 5000, false, 0, 0, 0, 0, 32, 0, 6, 1024, "dn_boss"),

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
        // Beehive is a RandomSpawn; the oracle plugin reports whether each house got one.
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
        new LocationConfig("Runestone_Boars", "BoarRunestone", Biome.Meadows,
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

        // CharredFortress — Ashlands fortress (Morgen Hold). Quantity/exterior placeholder —
        // this entry exists primarily so ReadFromWorldDb maps the prefab to type "CharredFortress".
        new LocationConfig("CharredFortress", "CharredFortress", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 5, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 64, 0, 40, 2048, ""),

        // CharredTowerRuins1_dvergr — Ashlands dvergr-occupied tower ruin variant.
        new LocationConfig("CharredTowerRuins1_dvergr", "DvergrHouse", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // Mistlands_Lighthouse1_new + GuardTower2/3 — Mistlands dvergr towers.
        new LocationConfig("Mistlands_Lighthouse1_new", "DvergrTower", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 32, 0, 40, 128, ""),
        new LocationConfig("Mistlands_GuardTower2_new", "DvergrTower", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 32, 0, 40, 128, ""),
        new LocationConfig("Mistlands_GuardTower3_new", "DvergrTower", Biome.Mistlands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 32, 0, 40, 128, ""),

        // PlaceofMystery{1,2,3} — Ashlands "Place of Mystery" (Torment Elite encounter).
        new LocationConfig("PlaceofMystery1", "PlaceOfMystery", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("PlaceofMystery2", "PlaceOfMystery", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("PlaceofMystery3", "PlaceOfMystery", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // MorgenHole variants — Ashlands "Putrid Hole" cave entrances. The in-game prefab
        // is MorgenHole{1,2,3}; "Putrid Hole" is only the friendly display name.
        new LocationConfig("MorgenHole1", "PutridHole", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("MorgenHole2", "PutridHole", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),
        new LocationConfig("MorgenHole3", "PutridHole", Biome.AshLands,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 1, 1000, false, 0, 1, 0, 0, 15, 0, 10, 128, ""),

        // ── Deep North (1.0) ────────────────────────────────────────────────
        // Transcribed from _LocationList_DeepNorth via
        // ValHelpTools/Scripts/extract_locations.py, so these carry the game's
        // own numbers rather than eyeballed ones. Only the entries with
        // m_enable set are here — the game ships hotspring{,2,3}, darkesthole,
        // HalfBurried_ForestCrypt and FimbulLocation01 switched off.

        // Mörkhalla — the fortress the shadow folk hold. Highest thing in the biome.
        new LocationConfig("MorkBorg", "Morkhalla", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 40, false, false, false,
            0, 0, 30, 10000, false, 0, 1, 0, 0, 30, 0, 300, 275, "morkborg"),

        // Northern Village — the most common Deep North structure by far.
        new LocationConfig("NorthVillage", "NorthVillage", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 135, false, false, false,
            0, 0, 2, 1000, false, 0, 1, 0, 0, 32, 0, 3, 70, ""),
        new LocationConfig("DN_hut01", "NorthVillage", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 40, false, false, false,
            0, 0, 40, 1000, false, 0, 1, 0, 0, 12, 0, 4, 100, "northvillage"),

        // Winding Tunnels — the Deep North dungeon entrance ("thehole").
        new LocationConfig("TheHole01", "WindingTunnels", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 40, false, false, false,
            0, 0, 2, 1000, false, 0, 1, 0, 0, 28, 0, 3, 256, ""),
        new LocationConfig("LumberCamp", "LumberCamp", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 4, 1000, true, 0, 1, 0, 0, 32, 0, 3, 100, "thehole"),

        // Ancestral Memorial — rare, and where the memorial offering happens.
        new LocationConfig("NorthMemorialPlace", "AncestralMemorial", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 15, false, false, false,
            0, 0, 2, 1000, false, 0, 1, 0, 0, 25, 0, 3, 400, "memorialplace"),

        // Ice ponds — the only Deep North location gated to inForest.
        new LocationConfig("IcePond1", "IcePond", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 40, false, false, false,
            0, 0, 10, 200, true, 0, 1, 0, 0, 20, 0, 2, 128, "icepond"),

        // Frozen ships — locked to the outer rim (8000-9750 from centre) and
        // to below sea level, so they ring the far north coast.
        new LocationConfig("FrozenShip01_DN", "FrozenShip", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            8000, 9750, -15, -5, false, 0, 1, 0, 0, 10, 0, 100, 64, "FrozenShip"),
        new LocationConfig("FrozenShip02_DN", "FrozenShip", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            8000, 9750, -15, -5, false, 0, 1, 0, 0, 16, 0, 100, 64, "FrozenShip"),
        new LocationConfig("FrozenShip03_DN", "FrozenShip", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            8000, 9750, -15, -5, false, 0, 1, 0, 0, 10, 0, 100, 64, "FrozenShip"),

        // Shipwrecks on the Deep North shoreline — same marker as the others.
        new LocationConfig("ShipWreck01_DN", "Shipwreck", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 170, false, false, false,
            0, 0, -0.5f, 0, false, 0, 1, 0, 0, 10, 0, 2, 0, ""),
        new LocationConfig("ShipWreck02_DN", "Shipwreck", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 120, false, false, false,
            0, 0, -0.5f, 1, false, 0, 1, 0, 0, 10, 0, 2, 0, ""),

        new LocationConfig("Runestone_DeepNorth", "DeepNorthRunestone", Biome.DeepNorth,
            WorldGenerator.BiomeArea.Everything, 70, false, false, false,
            0, 0, 0, 1000, false, 1, 5, 0, 0, 12, 0, 10, 128, "Runestones"),

        // Bear Cave — 1.0 adds this to the *Black Forest*, not the Deep North;
        // it rides along in the Deep North list. Note the unusual minimum
        // terrain delta of 5: it needs broken ground, not a flat clearing.
        new LocationConfig("BearCave", "BearCave", Biome.BlackForest,
            WorldGenerator.BiomeArea.Everything, 50, false, false, false,
            0, 0, 5, 1000, false, 1, 5, 0, 0, 12, 5, 10, 256, ""),
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
        ["CharredFortress"] = "Charred Fortress",
        ["CharredTowerRuins1_dvergr"] = "Dvergr House",
        ["Mistlands_Lighthouse1_new"] = "Dvergr Lighthouse",
        ["Mistlands_GuardTower2_new"] = "Dvergr Guard Tower",
        ["Mistlands_GuardTower3_new"] = "Dvergr Guard Tower",
        ["PlaceofMystery1"] = "Place of Mystery",
        ["PlaceofMystery2"] = "Place of Mystery",
        ["PlaceofMystery3"] = "Place of Mystery",
        ["MorgenHole1"] = "Putrid Hole",
        ["MorgenHole2"] = "Putrid Hole",
        ["MorgenHole3"] = "Putrid Hole",
        ["DN_Bossroom"] = "Kall Fimbulbringer",
        ["MorkBorg"] = "Mörkhalla",
        ["NorthVillage"] = "Northern Village",
        ["DN_hut01"] = "Northern Hut",
        ["TheHole01"] = "Winding Tunnels",
        ["LumberCamp"] = "Lumber Camp",
        ["NorthMemorialPlace"] = "Ancestral Memorial",
        ["IcePond1"] = "Ice Pond",
        ["FrozenShip01_DN"] = "Frozen Ship",
        ["FrozenShip02_DN"] = "Frozen Ship",
        ["FrozenShip03_DN"] = "Frozen Ship",
        ["ShipWreck01_DN"] = "Shipwreck",
        ["ShipWreck02_DN"] = "Shipwreck",
        ["Runestone_DeepNorth"] = "Deep North Runestone",
        ["BearCave"] = "Bear Cave",
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
    /// Every other location prefab the 1.0 game places, as (type, display name).
    /// These have no LocationConfig — they're extracted purely so the map/admin
    /// can show them. Names resolved by hashing GameObject names in the shipped
    /// bundles against the hashes in a real 1.0 world save.
    /// </summary>
    static readonly Dictionary<string, (string Type, string Name)> ExtraPrefabs = new()
    {
        ["AbandonedLogCabin02"] = ("AbandonedCabin", "Abandoned Log Cabin"),
        ["AbandonedLogCabin03"] = ("AbandonedCabin", "Abandoned Log Cabin"),
        ["AbandonedLogCabin04"] = ("AbandonedCabin", "Abandoned Log Cabin"),
        ["AncientUpgradeStation"] = ("AncientUpgradeStation", "Ancient Upgrade Station"),
        ["AshlandRuins"] = ("AshlandsRuins", "Ashlands Ruins"),
        ["BigRockClearing"] = ("RockClearing", "Rock Clearing"),
        ["CharredRuins1"] = ("CharredRuins", "Charred Ruins"),
        ["CharredRuins2"] = ("CharredRuins", "Charred Ruins"),
        ["CharredRuins3"] = ("CharredRuins", "Charred Ruins"),
        ["CharredRuins4"] = ("CharredRuins", "Charred Ruins"),
        ["CharredStone_Spawner"] = ("CharredStoneSpawner", "Charred Stone Spawner"),
        ["CharredTowerRuins1"] = ("CharredTowerRuins", "Charred Tower Ruins"),
        ["CharredTowerRuins2"] = ("CharredTowerRuins", "Charred Tower Ruins"),
        ["CharredTowerRuins3"] = ("CharredTowerRuins", "Charred Tower Ruins"),
        ["CombatRuin01"] = ("CombatRuin", "Combat Ruin"),
        ["DN_gammeltrollFrac01"] = ("OldTroll", "Old Troll Remains"),
        ["DN_gammeltrollFrac02"] = ("OldTroll", "Old Troll Remains"),
        ["Dolmen01"] = ("Dolmen", "Dolmen"),
        ["Dolmen02"] = ("Dolmen", "Dolmen"),
        ["Dolmen03"] = ("Dolmen", "Dolmen"),
        ["DrakeLorestone"] = ("Lorestone", "Drake Lorestone"),
        ["FortressRuins"] = ("FortressRuins", "Fortress Ruins"),
        ["GoblinHut01"] = ("GoblinHut", "Fuling Hut"),
        ["GoblinHut02"] = ("GoblinHut", "Fuling Hut"),
        ["GoblinHut03"] = ("GoblinHut", "Fuling Hut"),
        ["Grave1"] = ("Grave", "Grave"),
        ["Hildir_cave"] = ("HildirDungeon", "Howling Cavern"),
        ["Hildir_crypt"] = ("HildirDungeon", "Smouldering Tomb"),
        ["Hildir_plainsfortress"] = ("HildirDungeon", "Sealed Tower"),
        ["InfestedTree01"] = ("InfestedTree", "Infested Tree"),
        ["LeviathanLava"] = ("LavaLeviathan", "Lava Leviathan"),
        ["Mistlands_Excavation1"] = ("Excavation", "Dvergr Excavation"),
        ["Mistlands_Excavation2"] = ("Excavation", "Dvergr Excavation"),
        ["Mistlands_Excavation3"] = ("Excavation", "Dvergr Excavation"),
        ["Mistlands_Giant1"] = ("GiantRemains", "Giant Remains"),
        ["Mistlands_Giant2"] = ("GiantRemains", "Giant Remains"),
        ["Mistlands_GuardTower1_new"] = ("DvergrTower", "Dvergr Guard Tower"),
        ["Mistlands_GuardTower1_ruined_new"] = ("RuinedDvergrTower", "Ruined Dvergr Tower"),
        ["Mistlands_GuardTower1_ruined_new2"] = ("RuinedDvergrTower", "Ruined Dvergr Tower"),
        ["Mistlands_GuardTower3_ruined_new"] = ("RuinedDvergrTower", "Ruined Dvergr Tower"),
        ["Mistlands_Harbour1"] = ("Harbour", "Dvergr Harbour"),
        ["Mistlands_RoadPost1"] = ("RoadPost", "Road Post"),
        ["Mistlands_RockSpire1"] = ("RockSpire", "Rock Spire"),
        ["Mistlands_Statue1"] = ("GiantStatue", "Giant Statue"),
        ["Mistlands_Statue2"] = ("GiantStatue", "Giant Statue"),
        ["Mistlands_Swords1"] = ("GiantSwords", "Giant Swords"),
        ["Mistlands_Swords2"] = ("GiantSwords", "Giant Swords"),
        ["Mistlands_Swords3"] = ("GiantSwords", "Giant Swords"),
        ["Mistlands_Viaduct1"] = ("Viaduct", "Viaduct"),
        ["Mistlands_Viaduct2"] = ("Viaduct", "Viaduct"),
        ["MountainGrave01"] = ("Grave", "Mountain Grave"),
        ["MountainWell1"] = ("Well", "Mountain Well"),
        ["SwampWell1"] = ("Well", "Swamp Well"),
        ["Ruin1"] = ("Ruin", "Ruin"),
        ["Ruin3"] = ("Ruin", "Ruin"),
        ["Runestone_Meadows"] = ("Lorestone", "Meadows Lorestone"),
        ["Runestone_BlackForest"] = ("Lorestone", "Black Forest Lorestone"),
        ["Runestone_Greydwarfs"] = ("Lorestone", "Greydwarf Lorestone"),
        ["Runestone_Swamps"] = ("Lorestone", "Swamp Lorestone"),
        ["Runestone_Draugr"] = ("Lorestone", "Draugr Lorestone"),
        ["Runestone_Mountains"] = ("Lorestone", "Mountain Lorestone"),
        ["Runestone_Plains"] = ("Lorestone", "Plains Lorestone"),
        ["Runestone_Mistlands"] = ("Lorestone", "Mistlands Lorestone"),
        ["Runestone_Ashlands"] = ("Lorestone", "Ashlands Lorestone"),
        ["ShipSetting01"] = ("ShipSetting", "Ship Setting"),
        ["ShipSetting02"] = ("ShipSetting", "Ship Setting"),
        ["ShipSetting03"] = ("ShipSetting", "Ship Setting"),
        ["StoneCircle"] = ("StoneCircle", "Stone Circle"),
        ["StoneHenge1"] = ("StoneHenge", "Stone Henge"),
        ["StoneHenge2"] = ("StoneHenge", "Stone Henge"),
        ["StoneHenge6"] = ("StoneHenge", "Stone Henge"),
        ["StoneHouse3"] = ("StoneHouse", "Stone House"),
        ["StoneHouse4"] = ("StoneHouse", "Stone House"),
        ["StoneTower3"] = ("StoneTower", "Stone Tower"),
        ["StoneTowerRuins03"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins05"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins05_leet"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins07"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins07_sunk"] = ("StoneTowerRuins", "Sunken Stone Tower Ruins"),
        ["StoneTowerRuins08"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins08_sunk"] = ("StoneTowerRuins", "Sunken Stone Tower Ruins"),
        ["StoneTowerRuins09"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins09_sunk"] = ("StoneTowerRuins", "Sunken Stone Tower Ruins"),
        ["StoneTowerRuins10"] = ("StoneTowerRuins", "Stone Tower Ruins"),
        ["StoneTowerRuins10_sunk"] = ("StoneTowerRuins", "Sunken Stone Tower Ruins"),
        ["SulfurArch"] = ("SulfurArch", "Sulfur Arch"),
        ["SwampHut1"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut1_1"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut2"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut2_1"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut3"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut3_1"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut4"] = ("SwampHut", "Swamp Hut"),
        ["SwampHut5"] = ("SwampHut", "Swamp Hut"),
        ["TarPit1"] = ("TarPit", "Tar Pit"),
        ["TarPit2"] = ("TarPit", "Tar Pit"),
        ["TarPit3"] = ("TarPit", "Tar Pit"),
        ["VoltureNest"] = ("VoltureNest", "Volture Nest"),
        ["Waymarker01"] = ("Waymarker", "Waymarker"),
        ["Waymarker02"] = ("Waymarker", "Waymarker"),
        ["WoodFarm1"] = ("Village", "Abandoned Farm"),
        ["WoodVillage1"] = ("Village", "Abandoned Village"),
        ["WoodVillage2"] = ("Village", "Abandoned Village"),
    };

    /// <summary>
    /// Reads location instances out of a Valheim 1.0 world save
    /// (<c>worlds_local/&lt;world&gt;/_main.N.db2</c>), as written by
    /// <c>ZNet.SaveWorldThread</c>:
    /// <c>int version, double netTime, int len, byte[len] gzip(ZoneSystem data)</c>.
    /// The ZoneSystem block is generated zones, location version, global keys,
    /// the locations-generated flag, then <c>(int prefabHash, float x, y, z, bool placed)</c>
    /// per location. Locations are keyed by <c>prefabName.GetStableHashCode()</c>.
    /// Every instance is returned — map filtering is the frontend's job. Hashes
    /// that match no known prefab come back as type "Unknown" with prefab
    /// <c>#&lt;hash&gt;</c>, and are also counted into <paramref name="unknown"/>.
    /// Returns null if the file is missing or holds no locations.
    /// </summary>
    public static List<PoiLocation>? ReadFromWorldDb(string dbPath, int worldSeed, out Dictionary<int, int> unknown,
        WorldGenerator? wg = null, IReadOnlyDictionary<(string, int, int), LootSample>? loot = null)
    {
        unknown = new();
        if (!File.Exists(dbPath)) return null;

        byte[] zone;
        using (var br = new BinaryReader(File.OpenRead(dbPath)))
        {
            int version = br.ReadInt32();
            if (version < 41)
                throw new InvalidDataException($"{dbPath}: world version {version}, expected a 1.0 (41+) .db2");
            br.ReadDouble(); // net time
            var compressed = br.ReadBytes(br.ReadInt32());
            using var gz = new GZipStream(new MemoryStream(compressed), CompressionMode.Decompress);
            using var ms = new MemoryStream();
            gz.CopyTo(ms);
            zone = ms.ToArray();
        }

        var byHash = FriendlyNames.Keys.Concat(ExtraPrefabs.Keys).ToDictionary(StableHash.GetStableHashCode);
        var results = new List<PoiLocation>();

        using var r = new BinaryReader(new MemoryStream(zone), Encoding.UTF8);
        int zones = r.ReadInt32();
        r.BaseStream.Seek(zones * 4L, SeekOrigin.Current); // Vector2s = 2 x int16
        r.ReadInt32(); // location version
        int keys = r.ReadInt32();
        for (int i = 0; i < keys; i++) r.ReadString();
        r.ReadBoolean(); // locations generated
        int count = r.ReadInt32();

        for (int i = 0; i < count; i++)
        {
            int hash = r.ReadInt32();
            float x = r.ReadSingle();
            r.ReadSingle(); // y
            float z = r.ReadSingle();
            bool placed = r.ReadBoolean();

            string? biome = wg?.GetBiome(x, z).ToString();

            if (!byHash.TryGetValue(hash, out var prefabName))
            {
                unknown[hash] = unknown.GetValueOrDefault(hash) + 1;
                results.Add(new PoiLocation("Unknown location", "Unknown", x, z,
                    Prefab: $"#{hash}", Generated: placed, Biome: biome));
                continue;
            }

            if (ExtraPrefabs.TryGetValue(prefabName, out var extra))
            {
                ChestItem[][]? extraChests = null;
                if (loot != null && loot.TryGetValue(LootKey(prefabName, x, z), out var extraSample)
                    && extraSample.Chests.Length > 0)
                    extraChests = extraSample.Chests;
                results.Add(new PoiLocation(extra.Name, extra.Type, x, z,
                    Prefab: prefabName, Generated: placed, Biome: biome, Chests: extraChests));
                continue;
            }

            var friendly = FriendlyNames[prefabName];
            var cfg = AllLocations.FirstOrDefault(c => c.PrefabName == prefabName);
            string type = cfg?.Type ?? (prefabName == "StartTemple" ? "Start" : "Boss Altar");

            string[]? items = cfg?.StaticItems;
            ChestItem[][]? chests = null;
            IReadOnlyDictionary<string, int>? creatures = null;
            string[]? vegvisirs = null;
            if (loot != null && loot.TryGetValue(LootKey(prefabName, x, z), out var sample))
            {
                var found = LootItems(sample);
                if (found.Count > 0) items = (items ?? Array.Empty<string>()).Concat(found).ToArray();
                if (sample.Chests.Length > 0) chests = sample.Chests;
                if (sample.Creatures.Count > 0) creatures = sample.Creatures;
                if (sample.Vegvisirs.Length > 0) vegvisirs = sample.Vegvisirs;
            }

            results.Add(new PoiLocation(friendly, type, x, z,
                Prefab: prefabName, Items: items, Generated: placed, Biome: biome, Chests: chests,
                Creatures: creatures, Vegvisirs: vegvisirs));
        }

        return results.Count > 0 ? results : null;
    }

    /// <summary>Loot lookup key: prefab plus position rounded to 0.1 units.</summary>
    public static (string, int, int) LootKey(string prefab, float x, float z)
        => (prefab, (int)MathF.Round(x * 10f), (int)MathF.Round(z * 10f));

    /// <summary>
    /// Reads the oracle plugin's <c>oracle.loot.json</c> into a lookup by
    /// <see cref="LootKey"/>. Missing or unreadable file: null, and POIs simply
    /// carry no loot.
    /// </summary>
    public static Dictionary<(string, int, int), LootSample>? LoadLoot(string path)
    {
        if (!File.Exists(path)) return null;
        using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
        var map = new Dictionary<(string, int, int), LootSample>();
        foreach (var e in doc.RootElement.EnumerateArray())
        {
            string prefab = e.GetProperty("prefab").GetString() ?? "";
            float x = e.GetProperty("x").GetSingle(), z = e.GetProperty("z").GetSingle();
            var chests = e.GetProperty("chests").EnumerateArray()
                .Select(c => c.EnumerateArray()
                    .Select(item => new ChestItem(item[0].GetString() ?? "?", item[1].GetInt32()))
                    .ToArray())
                .ToArray();
            static Dictionary<string, int> Counts(System.Text.Json.JsonElement parent, string name) =>
                parent.TryGetProperty(name, out var o)
                    ? o.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32())
                    : new Dictionary<string, int>();
            var vegvisirs = e.TryGetProperty("vegvisirs", out var vv)
                ? vv.EnumerateArray().Select(v => v.GetString() ?? "").Where(v => v != "").ToArray()
                : Array.Empty<string>();
            map[LootKey(prefab, x, z)] = new LootSample(prefab, x, z,
                e.GetProperty("beehives").GetInt32(), chests,
                Counts(e, "objects"), Counts(e, "present"), Counts(e, "creatures"), vegvisirs);
        }
        return map;
    }

    /// <summary>
    /// The finds we surface as POI items (they drive the map's icons), read off
    /// what the game spawned rather than simulated.
    /// </summary>
    static List<string> LootItems(LootSample s)
    {
        var items = new List<string>();
        // Also check the spawned objects: plugin builds before the 1.0 fix counted 0 beehives.
        if (s.Beehives > 0 || s.Objects.ContainsKey("Beehive")) items.Add("Beehive");
        foreach (var c in s.Chests.SelectMany(x => x))
        {
            if (c.Item == "AxeHead1") items.Add("Mysterious Axe Head");
            else if (c.Item == "AxeHead2") items.Add("Curious Axe Head");
        }
        if (s.Objects.ContainsKey("Spawner_Troll")) items.Add("Troll");
        if (s.Objects.ContainsKey("goblin_totempole")) items.Add("GoblinTotem");
        if (s.Present.Keys.Any(k => k.Contains("Vegvisir"))) items.Add("Vegvisir");
        return items;
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
            string friendly = FriendlyNames.GetValueOrDefault(loc.PrefabName, loc.PrefabName);
            foreach (var (x, z) in found)
                results.Add(new PoiLocation(friendly, loc.Type, x, z,
                    Prefab: loc.PrefabName, Items: loc.StaticItems));
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

    record LocationConfig(
        string PrefabName, string Type, Biome Biome, WorldGenerator.BiomeArea BiomeArea,
        int Quantity, bool Prioritized, bool CenterFirst, bool Unique,
        float MinDist, float MaxDist, float MinAlt, float MaxAlt,
        bool InForest, float ForestMin, float ForestMax,
        float MinDistCenter, float MaxDistCenter, float ExteriorRadius,
        float MinTerrainDelta, float MaxTerrainDelta, float MinDistSimilar, string Group,
        string[]? StaticItems = null, string? ChestType = null);
}
