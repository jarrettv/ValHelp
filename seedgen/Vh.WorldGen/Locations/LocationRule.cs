using System.Text.Json;

namespace Vh.World.Locations;

/// <summary>
/// One location type's placement rules (the game's ZoneSystem.ZoneLocation), as
/// the oracle plugin dumps them (oracle.locations.json, DumpLocations). Seed
/// independent: the same list for every world of a game version.
/// </summary>
public sealed class LocationRule
{
    public string Name = "";
    public string Prefab = "";
    public bool Enable = true;
    public Biome Biome;
    public int BiomeArea = 3;
    public int Quantity;
    public bool Prioritized, CenterFirst, Unique;
    public string Group = "", GroupMax = "";
    public float MinDistanceFromSimilar, MaxDistanceFromSimilar;
    public float InteriorRadius, ExteriorRadius;
    public float MinTerrainDelta, MaxTerrainDelta = 2f;
    public float MinimumVegetation, MaximumVegetation = 1f;
    public bool SurroundCheckVegetation;
    public float SurroundCheckDistance = 20f;
    public int SurroundCheckLayers = 2;
    public float SurroundBetterThanAverage;
    public bool InForest;
    public float ForestTresholdMin, ForestTresholdMax = 1f;
    public float MinDistanceFromCenter, MaxDistanceFromCenter;
    public float MinDistance, MaxDistance;
    public float MinAltitude = -1000f, MaxAltitude = 1000f;
    public string? AltBiomeParent;

    /// <summary>The rules shipped with the library (Data/locations.json, from
    /// scripts/export_location_rules.py), and the game version they're from.</summary>
    public static (List<LocationRule> Locations, List<AltBiomeRule> AltBiomes, string GameVersion) LoadEmbedded()
    {
        using var stream = typeof(LocationRule).Assembly.GetManifestResourceStream("locations.json")
            ?? throw new InvalidOperationException("locations.json isn't embedded");
        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var (locations, alts) = Load(json);
        using var doc = JsonDocument.Parse(json);
        return (locations, alts, doc.RootElement.GetProperty("gameVersion").GetString() ?? "?");
    }

    /// <summary>The location rules and alt-biome rules from an oracle.locations.json.</summary>
    public static (List<LocationRule> Locations, List<AltBiomeRule> AltBiomes) Load(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var locations = new List<LocationRule>();
        foreach (var e in root.GetProperty("locations").EnumerateArray())
        {
            locations.Add(new LocationRule
            {
                Name = e.GetProperty("name").GetString() ?? "",
                Prefab = e.GetProperty("prefab").GetString() ?? "",
                Enable = e.GetProperty("enable").GetBoolean(),
                Biome = (Biome)e.GetProperty("biome").GetInt32(),
                BiomeArea = e.GetProperty("biomeArea").GetInt32(),
                Quantity = e.GetProperty("quantity").GetInt32(),
                Prioritized = e.GetProperty("prioritized").GetBoolean(),
                CenterFirst = e.GetProperty("centerFirst").GetBoolean(),
                Unique = e.GetProperty("unique").GetBoolean(),
                Group = e.GetProperty("group").GetString() ?? "",
                MinDistanceFromSimilar = F(e, "minDistanceFromSimilar"),
                GroupMax = e.GetProperty("groupMax").GetString() ?? "",
                MaxDistanceFromSimilar = F(e, "maxDistanceFromSimilar"),
                InteriorRadius = F(e, "interiorRadius"),
                ExteriorRadius = F(e, "exteriorRadius"),
                MinTerrainDelta = F(e, "minTerrainDelta"),
                MaxTerrainDelta = F(e, "maxTerrainDelta"),
                MinimumVegetation = F(e, "minimumVegetation"),
                MaximumVegetation = F(e, "maximumVegetation"),
                SurroundCheckVegetation = e.GetProperty("surroundCheckVegetation").GetBoolean(),
                SurroundCheckDistance = F(e, "surroundCheckDistance"),
                SurroundCheckLayers = e.GetProperty("surroundCheckLayers").GetInt32(),
                SurroundBetterThanAverage = F(e, "surroundBetterThanAverage"),
                InForest = e.GetProperty("inForest").GetBoolean(),
                ForestTresholdMin = F(e, "forestTresholdMin"),
                ForestTresholdMax = F(e, "forestTresholdMax"),
                MinDistanceFromCenter = F(e, "minDistanceFromCenter"),
                MaxDistanceFromCenter = F(e, "maxDistanceFromCenter"),
                MinDistance = F(e, "minDistance"),
                MaxDistance = F(e, "maxDistance"),
                MinAltitude = F(e, "minAltitude"),
                MaxAltitude = F(e, "maxAltitude"),
                AltBiomeParent = e.GetProperty("altBiomeParent").GetString(),
            });
        }
        var alts = new List<AltBiomeRule>();
        foreach (var e in root.GetProperty("altBiomes").EnumerateArray())
        {
            alts.Add(new AltBiomeRule
            {
                Name = e.GetProperty("name").GetString() ?? "",
                Enabled = e.GetProperty("enabled").GetBoolean(),
                Biome = (Biome)e.GetProperty("biome").GetInt32(),
                MinDistanceFromCenter = F(e, "minDistanceFromCenter"),
                MinAmountSpawned = e.GetProperty("minAmountSpawned").GetInt32(),
                MaxAmountSpawned = e.GetProperty("maxAmountSpawned").GetInt32(),
                Chance = F(e, "chance"),
                RequireNeighbor = (Biome)e.GetProperty("requireNeighbor").GetInt32(),
                NotNeighbor = (Biome)e.GetProperty("notNeighbor").GetInt32(),
                IncompatibleAltBiomes = Strings(e, "incompatibleAltBiomes"),
                MinEdgeSize = e.GetProperty("minEdgeSize").GetInt32(),
                MaxEdgeSize = e.GetProperty("maxEdgeSize").GetInt32(),
                MinAvgHeight = F(e, "minAvgHeight"),
                MaxAvgHeight = F(e, "maxAvgHeight"),
                BelowWorldX = F(e, "belowWorldX"),
                AboveWorldX = F(e, "aboveWorldX"),
                BelowWorldY = F(e, "belowWorldY"),
                AboveWorldY = F(e, "aboveWorldY"),
                BlockLocationNames = Strings(e, "blockLocationNames"),
            });
        }
        return (locations, alts);
    }

    // The plugin writes floats with "R" (round-trip), so parsing back is exact.
    static float F(JsonElement e, string name) => e.GetProperty(name).GetSingle();

    static List<string> Strings(JsonElement e, string name) =>
        e.GetProperty(name).EnumerateArray().Select(x => x.GetString() ?? "").ToList();
}
