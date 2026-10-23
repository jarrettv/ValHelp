using System.IO.Compression;
using System.Text.Json;

namespace Vh.World;

/// <summary>
/// The room catalog DungeonSim runs on, exported from the game's bundles by
/// scripts/export_dungeon_rooms.py into WorldGen/Data/dungeons.json.gz (see that
/// script for the format). Rooms are in DungeonDB order, which matters: the
/// generator picks rooms by index and walks them in order for weights.
/// </summary>
public sealed class DungeonCatalog
{
    public required IReadOnlyList<CatalogRoom> Rooms { get; init; }
    public required IReadOnlyDictionary<string, CatalogLocation> Locations { get; init; }

    static DungeonCatalog? s_instance;

    /// <summary>The catalog embedded in seedgen, loaded on first use.</summary>
    public static DungeonCatalog Instance => s_instance ??= LoadEmbedded();

    static DungeonCatalog LoadEmbedded()
    {
        using var s = typeof(DungeonCatalog).Assembly.GetManifestResourceStream("dungeons.json.gz")
            ?? throw new InvalidOperationException("dungeons.json.gz is not embedded");
        return Load(s);
    }

    public static DungeonCatalog Load(Stream gz)
    {
        using var unzip = new GZipStream(gz, CompressionMode.Decompress);
        using var doc = JsonDocument.Parse(unzip);
        var root = doc.RootElement;
        var rooms = root.GetProperty("rooms").EnumerateArray().Select(r => new CatalogRoom
        {
            Name = r.GetProperty("name").GetString()!,
            ListEnabled = r.GetProperty("listEnabled").GetBoolean(),
            ListTheme = r.GetProperty("listTheme").GetInt32(),
            Size = new V3(r.GetProperty("size")[0].GetSingle(), r.GetProperty("size")[1].GetSingle(), r.GetProperty("size")[2].GetSingle()),
            Theme = r.GetProperty("theme").GetInt32(),
            Entrance = r.GetProperty("entrance").GetBoolean(),
            EndCap = r.GetProperty("endCap").GetBoolean(),
            Divider = r.GetProperty("divider").GetBoolean(),
            EndCapPrio = r.GetProperty("endCapPrio").GetInt32(),
            MinPlaceOrder = r.GetProperty("minPlaceOrder").GetInt32(),
            Weight = r.GetProperty("weight").GetSingle(),
            Perimeter = r.GetProperty("perimeter").GetBoolean(),
            FaceCenter = r.GetProperty("faceCenter").GetBoolean(),
            Tree = ReadTree(r),
        }).ToList();
        var locations = new Dictionary<string, CatalogLocation>();
        foreach (var p in root.GetProperty("locations").EnumerateObject())
        {
            var l = p.Value;
            var g = l.GetProperty("generator");
            locations[p.Name] = new CatalogLocation
            {
                Name = p.Name,
                Tree = ReadTree(l),
                UseCustomInteriorTransform = l.GetProperty("useCustomInteriorTransform").GetBoolean(),
                InteriorNode = l.GetProperty("interiorNode").GetInt32(),
                GeneratorNode = l.GetProperty("generatorNode").GetInt32(),
                Algorithm = g.GetProperty("algorithm").GetInt32(),
                MaxRooms = g.GetProperty("maxRooms").GetInt32(),
                MinRooms = g.GetProperty("minRooms").GetInt32(),
                MinRequiredRooms = g.GetProperty("minRequiredRooms").GetInt32(),
                RequiredRooms = g.GetProperty("requiredRooms").EnumerateArray().Select(x => x.GetString()!).ToArray(),
                AlternativeFunctionality = g.GetProperty("alternativeFunctionality").GetBoolean(),
                Themes = g.GetProperty("themes").GetInt32(),
                ZoneSize = ReadV3(g.GetProperty("zoneSize")),
                GeneratorUseCustomInteriorTransform = g.GetProperty("useCustomInteriorTransform").GetBoolean(),
                AddBaseSeedToRandomSpawn = g.GetProperty("addBaseSeedToRandomSpawn").GetBoolean(),
                OriginalPosition = ReadV3(g.GetProperty("originalPosition")),
                DoorChance = g.GetProperty("doorChance").GetSingle(),
                CampRadiusMin = g.GetProperty("campRadiusMin").GetSingle(),
                CampRadiusMax = g.GetProperty("campRadiusMax").GetSingle(),
                MaxTilt = g.GetProperty("maxTilt").GetSingle(),
                MinAltitude = g.GetProperty("minAltitude").GetSingle(),
                PerimeterSections = g.GetProperty("perimeterSections").GetInt32(),
                PerimeterBuffer = g.GetProperty("perimeterBuffer").GetSingle(),
                DoorTypes = g.GetProperty("doorTypes").EnumerateArray()
                    .Select(d => new DoorType(d[0].GetString()!, d[1].GetString()!, d[2].GetSingle())).ToArray(),
            };
        }
        return new DungeonCatalog { Rooms = rooms, Locations = locations };
    }

    static V3 ReadV3(JsonElement a) => new(a[0].GetSingle(), a[1].GetSingle(), a[2].GetSingle());

    static PrefabTree ReadTree(JsonElement e)
    {
        var nodes = e.GetProperty("nodes").EnumerateArray().Select(n =>
        {
            var hasScale = n.GetArrayLength() >= 12;
            return new TreeNode(
                n[0].GetInt32(), n[1].GetInt32() != 0,
                new V3(n[2].GetSingle(), n[3].GetSingle(), n[4].GetSingle()),
                new Quat(n[5].GetSingle(), n[6].GetSingle(), n[7].GetSingle(), n[8].GetSingle()),
                hasScale ? new V3(n[9].GetSingle(), n[10].GetSingle(), n[11].GetSingle()) : V3.One);
        }).ToArray();
        var conns = e.TryGetProperty("connections", out var c)
            ? c.EnumerateArray().Select(x => new TreeConnection(x[0].GetInt32(), x[1].GetString()!, x[2].GetInt32() != 0,
                x[3].GetInt32() != 0, x[4].GetInt32() != 0)).ToArray()
            : Array.Empty<TreeConnection>();
        var spawns = e.GetProperty("randomSpawns").EnumerateArray().Select(x => new TreeRandomSpawn(
            x[0].GetInt32(), x[1].GetSingle(), x[2].GetInt32(), x[3].GetInt32(), x[4].GetInt32() != 0,
            x[5].GetInt32(), x[6].GetInt32(), x[7].GetInt32())).ToArray();
        var objects = e.GetProperty("randomObjects").EnumerateArray().Select(x => new TreeRandomObject(
            x[0].GetInt32(), x[1].GetInt32(), x[2].GetInt32(), x[3].GetInt32() != 0, x[4].GetInt32(), x[5].GetInt32(),
            x[6].EnumerateArray().Select(o => (o[0].GetInt32(), o[1].GetSingle())).ToArray())).ToArray();
        var views = e.GetProperty("netViews").EnumerateArray()
            .Select(x => new TreeNetView(x[0].GetInt32(), x[1].GetString()!)).ToArray();
        return new PrefabTree(nodes, conns, spawns, objects, views);
    }
}

public sealed class CatalogRoom
{
    public required string Name { get; init; }
    public bool ListEnabled { get; init; }      // DungeonDB RoomData.m_enabled
    public int ListTheme { get; init; }         // DungeonDB RoomData.m_theme
    public V3 Size { get; init; }               // Room.m_size
    public int Theme { get; init; }
    public bool Entrance { get; init; }
    public bool EndCap { get; init; }
    public bool Divider { get; init; }
    public int EndCapPrio { get; init; }
    public int MinPlaceOrder { get; init; }
    public float Weight { get; init; }
    public bool Perimeter { get; init; }
    public bool FaceCenter { get; init; }      // camp rooms: turned to face the camp's centre
    public required PrefabTree Tree { get; init; }
    public override string ToString() => Name;
}

public sealed class CatalogLocation
{
    public required string Name { get; init; }
    public required PrefabTree Tree { get; init; }
    public bool UseCustomInteriorTransform { get; init; }
    public int InteriorNode { get; init; }
    public int GeneratorNode { get; init; }
    public int Algorithm { get; init; }          // 0 Dungeon, 1 CampGrid, 2 CampRadial
    public int MaxRooms { get; init; }
    public int MinRooms { get; init; }
    public int MinRequiredRooms { get; init; }
    public required string[] RequiredRooms { get; init; }
    public bool AlternativeFunctionality { get; init; }
    public int Themes { get; init; }
    public V3 ZoneSize { get; init; }
    public bool GeneratorUseCustomInteriorTransform { get; init; }
    public bool AddBaseSeedToRandomSpawn { get; init; }
    public V3 OriginalPosition { get; init; }
    public float DoorChance { get; init; }
    public required DoorType[] DoorTypes { get; init; }
    // CampRadial: rooms scattered within a random radius, then a ring of perimeter rooms.
    public float CampRadiusMin { get; init; }
    public float CampRadiusMax { get; init; }
    public float MaxTilt { get; init; }          // degrees of ground slope a room may sit on
    public float MinAltitude { get; init; }      // above the water line (30)
    public int PerimeterSections { get; init; }
    public float PerimeterBuffer { get; init; }
}

public readonly record struct DoorType(string Prefab, string ConnectionType, float Chance);

public readonly record struct TreeNode(int Parent, bool Active, V3 Pos, Quat Rot, V3 Scale);
public readonly record struct TreeConnection(int Node, string Type, bool Entrance, bool AllowDoor, bool DoorOnlyIfOther);
public readonly record struct TreeRandomSpawn(int Node, float Chance, int RequireTheme, int RequireBiome, bool NotInLava,
    int MinElevation, int MaxElevation, int OffObject);
public readonly record struct TreeRandomObject(int Node, int RequireTheme, int RequireBiome, bool NotInLava,
    int MinElevation, int MaxElevation, (int Node, float Weight)[] Objects);
public readonly record struct TreeNetView(int Node, string Prefab);

/// <summary>
/// A prefab's hierarchy, cut down to the nodes that carry something the
/// generator touches. Node 0 is the prefab root; nodes are in depth-first
/// pre-order, the order GetComponentsInChildren returns components in.
/// </summary>
public sealed class PrefabTree
{
    public TreeNode[] Nodes { get; }
    public TreeConnection[] Connections { get; }
    public TreeRandomSpawn[] RandomSpawns { get; }
    public TreeRandomObject[] RandomObjects { get; }
    public TreeNetView[] NetViews { get; }
    /// <summary>Node index -> its ZNetView index, or -1.</summary>
    public int[] NetViewAt { get; }
    /// <summary>Last node index in each node's subtree (pre-order makes a subtree a contiguous range).</summary>
    public int[] SubtreeEnd { get; }

    public PrefabTree(TreeNode[] nodes, TreeConnection[] conns, TreeRandomSpawn[] spawns, TreeRandomObject[] objects, TreeNetView[] views)
    {
        Nodes = nodes; Connections = conns; RandomSpawns = spawns; RandomObjects = objects; NetViews = views;
        NetViewAt = Enumerable.Repeat(-1, nodes.Length).ToArray();
        for (int i = 0; i < views.Length; i++) NetViewAt[views[i].Node] = i;
        SubtreeEnd = new int[nodes.Length];
        for (int i = nodes.Length - 1; i >= 0; i--)
        {
            if (SubtreeEnd[i] < i) SubtreeEnd[i] = i;
            int p = nodes[i].Parent;
            if (p >= 0 && SubtreeEnd[p] < SubtreeEnd[i]) SubtreeEnd[p] = SubtreeEnd[i];
        }
    }

    public bool IsAncestorOrSelf(int ancestor, int node) => node >= ancestor && node <= SubtreeEnd[ancestor];

    /// <summary>Utils.IsEnabledInheirarcy: every node from <paramref name="node"/> up to
    /// <paramref name="root"/> is activeSelf.</summary>
    public bool EnabledUpTo(bool[] active, int node, int root)
    {
        for (int n = node; n >= 0; n = Nodes[n].Parent)
        {
            if (!active[n]) return false;
            if (n == root) return true;
        }
        return true;
    }

    public bool[] InitialActive() => Nodes.Select(n => n.Active).ToArray();
}
