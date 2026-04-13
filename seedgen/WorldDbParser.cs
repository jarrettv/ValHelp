using System.Text;

namespace SeedGen;

/// <summary>
/// Parses Valheim .db files to extract POI locations by scanning for known prefab names.
/// </summary>
public static class WorldDbParser
{
    static readonly Dictionary<string, (string Type, string Name)> KnownPrefabs = new()
    {
        // Bosses
        ["Eikthyrnir"]                    = ("Boss Altar", "Eikthyr"),
        ["GDKing"]                        = ("Boss Altar", "The Elder"),
        ["Bonemass"]                      = ("Boss Altar", "Bonemass"),
        ["Dragonqueen"]                   = ("Boss Altar", "Moder"),
        ["GoblinKing"]                    = ("Boss Altar", "Yagluth"),
        ["Mistlands_DvergrBossEntrance1"] = ("Boss Altar", "The Queen"),
        ["FaderLocation"]                 = ("Boss Altar", "Fader"),

        // Start & Traders
        ["StartTemple"]                   = ("Start", "Sacrificial Stones"),
        ["Vendor_BlackForest"]            = ("Trader", "Haldor"),
        ["Hildir_camp"]                   = ("Trader", "Hildir"),
        ["BogWitch_Camp"]                 = ("Trader", "Bog Witch"),

        // Meadows houses
        ["WoodHouse1"]                    = ("House", "WoodHouse1"),
        ["WoodHouse2"]                    = ("House", "WoodHouse2"),
        ["WoodHouse3"]                    = ("House", "WoodHouse3"),
        ["WoodHouse4"]                    = ("House", "WoodHouse4"),
        ["WoodHouse5"]                    = ("House", "WoodHouse5"),
        ["WoodHouse6"]                    = ("House", "WoodHouse6"),
        ["WoodHouse7"]                    = ("House", "WoodHouse7"),
        ["WoodHouse8"]                    = ("House", "WoodHouse8"),
        ["WoodHouse9"]                    = ("House", "WoodHouse9"),
        ["WoodHouse10"]                   = ("House", "WoodHouse10"),
        ["WoodHouse11"]                   = ("House", "WoodHouse11"),
        ["WoodHouse12"]                   = ("House", "WoodHouse12"),
        ["WoodHouse13"]                   = ("House", "WoodHouse13"),

        // Meadows
        ["Runestone_Boars"]               = ("Runestone", "Boar Runestone"),

        // Shipwrecks
        ["ShipWreck01"]                   = ("Shipwreck", "Shipwreck"),
        ["ShipWreck02"]                   = ("Shipwreck", "Shipwreck"),
        ["ShipWreck03"]                   = ("Shipwreck", "Shipwreck"),
        ["ShipWreck04"]                   = ("Shipwreck", "Shipwreck"),

        // Black Forest
        ["Greydwarf_camp1"]               = ("GreydwarfNest", "Greydwarf Nest"),
        ["TrollCave02"]                   = ("TrollCave", "Troll Cave"),
        ["Crypt2"]                        = ("Crypt", "Burial Chamber"),
        ["Crypt3"]                        = ("Crypt", "Burial Chamber"),
        ["Crypt4"]                        = ("Crypt", "Burial Chamber"),
        ["Ruin2"]                         = ("RuinVegvisir", "Elder Vegvisir Ruin"),

        // Swamp
        ["SunkenCrypt4"]                  = ("SunkenCrypt", "Sunken Crypt"),
        ["FireHole"]                      = ("Geyser", "Geyser"),
        ["SwampRuin1"]                    = ("SwampVegvisir", "Bonemass Vegvisir"),
        ["SwampRuin2"]                    = ("SwampVegvisir", "Bonemass Vegvisir"),

        // Mountain
        ["StoneTowerRuins04"]             = ("MountainVegvisir", "Moder Vegvisir"),
        ["MountainCave02"]                = ("MountainCave", "Frost Cave"),
        ["DrakeNest01"]                   = ("DrakeNest", "Drake Nest"),

        // Plains
        ["StoneTower1"]                   = ("Totem", "Fuling Totem"),
        ["GoblinCamp2"]                   = ("Totem", "Fuling Totem"),
        ["StoneHenge3"]                   = ("PlainsVegvisir", "Yagluth Vegvisir"),
        ["StoneHenge4"]                   = ("PlainsVegvisir", "Yagluth Vegvisir"),
        ["StoneHenge5"]                   = ("PlainsVegvisir", "Yagluth Vegvisir"),

        // Mistlands
        ["Mistlands_DvergrTownEntrance1"] = ("InfestedMine", "Infested Mine"),
        ["Mistlands_DvergrTownEntrance2"] = ("InfestedMine", "Infested Mine"),
        ["Mistlands_StatueGroup1"]        = ("AncientRoot", "Ancient Root"),
    };

    public static List<PoiEntry>? Parse(string dbPath)
    {
        byte[] data;
        try { data = File.ReadAllBytes(dbPath); }
        catch { return null; }

        var results = new List<PoiEntry>();

        foreach (var (prefabName, (type, name)) in KnownPrefabs)
        {
            var nameBytes = Encoding.UTF8.GetBytes(prefabName);
            var needle = new byte[1 + nameBytes.Length];
            needle[0] = (byte)nameBytes.Length;
            Array.Copy(nameBytes, 0, needle, 1, nameBytes.Length);

            int pos = 0;
            while (true)
            {
                pos = FindBytes(data, needle, pos);
                if (pos < 0) break;

                int after = pos + needle.Length;
                if (after + 12 <= data.Length)
                {
                    float x = BitConverter.ToSingle(data, after);
                    float y = BitConverter.ToSingle(data, after + 4);
                    float z = BitConverter.ToSingle(data, after + 8);

                    if (Math.Abs(x) < 20000 && Math.Abs(z) < 20000 && Math.Abs(y) < 1000)
                        results.Add(new(type, name, MathF.Round(x, 1), MathF.Round(z, 1)));
                }
                pos = after;
            }
        }

        return results;
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
}

public record PoiEntry(string Type, string Name, float X, float Z);
