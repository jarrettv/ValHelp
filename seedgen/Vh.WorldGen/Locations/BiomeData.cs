namespace Vh.World.Locations;

/// <summary>
/// The game's AltBiomeWorldData (+ BiomeSector, BiomeTypeInfo): the 2048² biome
/// grid split into sectors (connected patches of one biome), with the alt biomes
/// ("Mushroom", ...) assigned to sectors, and per biome the list of grid points
/// location placement picks zones from (GetRandomPointByBiomes). Ported line for
/// line, quirks included (noted where they look like bugs); order matters
/// everywhere, since placement indexes these lists with the seeded RNG.
///
/// Grid indexing as the game's [x, y]: x east (column), y north (row), stored
/// flat at y * Size + x, the same layout as <see cref="WorldGrid"/>.
/// </summary>
public sealed class BiomeData
{
    public const int Size = 2048;

    /// <summary>Heightmap.Biome values in Enum.GetValues order, which is the order the
    /// game builds (and iterates) its per-biome table in: Land and All included.</summary>
    public static readonly Biome[] BiomeOrder =
    {
        Biome.None, Biome.Meadows, Biome.Swamp, Biome.Mountain, Biome.BlackForest, Biome.Plains,
        Biome.AshLands, Biome.DeepNorth, Biome.Ocean, Biome.Mistlands, (Biome)0x27F /* Land */, (Biome)0x37F /* All */,
    };

    public readonly float[] Heights = new float[Size * Size];
    public readonly byte[] Biomes = new byte[Size * Size];          // WorldGrid.BiomeIndex
    public readonly Sector?[] PointSectors = new Sector?[Size * Size];
    public readonly List<Sector> Sectors = new();
    public readonly Dictionary<Biome, BiomeType> Types = new();

    public sealed class BiomeType(Biome biome)
    {
        public readonly Biome Biome = biome;
        public readonly List<Sector> Sectors = new();
        public readonly List<(short X, short Y)> AllPoints = new();
        public readonly List<(short X, short Y)> AllPointsAboveSeaLevel = new();
    }

    public sealed class Sector
    {
        public readonly int Index;          // position in BiomeData.Sectors
        public readonly Biome Biome;
        public int EdgeCount;
        public readonly List<Sector> Neighbors = new(4);
        public Vector2 Center;
        // Never moves below its starting (0, 0): the game's edge pass only lowers Min
        // past its current value, so it stays (0, 0) (a game quirk, kept).
        public Vector2 Min;
        public Vector2 Max;
        public float HeightMin = 99999f;
        public float HeightMax = -99999f;
        public float HeightAvg;
        public float DistanceFromCenter;
        public readonly List<AltBiomeRule> AltBiomes = new();

        internal Sector(BiomeData data, Biome biome)
        {
            Biome = biome;
            Index = data.Sectors.Count;
            data.Types[biome].Sectors.Add(this);
        }
    }

    BiomeData()
    {
        foreach (var b in BiomeOrder) Types[b] = new BiomeType(b);
    }

    static Biome ToBiome(byte index) => index switch
    {
        1 => Biome.Meadows, 2 => Biome.Swamp, 3 => Biome.Mountain, 4 => Biome.BlackForest, 5 => Biome.Plains,
        6 => Biome.AshLands, 7 => Biome.DeepNorth, 8 => Biome.Ocean, 9 => Biome.Mistlands, _ => Biome.None,
    };

    /// <summary>AltBiomeWorldData.MapSpaceToWorldSpace: evaluated in double under Mono, rounded once.</summary>
    public static float MapToWorld(float x) => (float)(((double)x - 1024.0) * 12.0 + 6.0);

    /// <summary>AltBiomeWorldData.WorldSpaceToMapSpace.</summary>
    public static int WorldToMap(float x) => (int)(((double)x - 6.0) / 12.0 + 1024.0);

    /// <summary>
    /// GenerateBiomePoints + GenerateSectors (+ GenerateAltBiomes when rules are given).
    /// <paramref name="grid"/> holds the same GetBiome/GetBiomeHeight sweep the game makes.
    /// </summary>
    public static BiomeData Build(WorldGrid grid, int worldSeed, IReadOnlyList<AltBiomeRule>? altBiomes = null)
    {
        var d = new BiomeData();
        for (int y = 0; y < Size; y++)
        {
            float wy = MapToWorld(y);
            for (int x = 0; x < Size; x++)
            {
                float wx = MapToWorld(x);
                int k = y * Size + x;
                // Vector2.sqrMagnitude > 110250000f (radius 10500): ocean, -1000 m.
                if ((float)((double)wx * wx + (double)wy * wy) > 110250000f)
                {
                    d.Biomes[k] = 8;
                    d.Heights[k] = -1000f;
                }
                else
                {
                    d.Biomes[k] = grid.Biome[k];
                    d.Heights[k] = grid.Height[k];
                }
            }
        }
        d.GenerateSectors();
        if (altBiomes != null) d.GenerateAltBiomes(altBiomes, worldSeed);
        return d;
    }

    void AddPoint(Sector s, short x, short y)
    {
        var t = Types[s.Biome];
        t.AllPoints.Add((x, y));
        if (Heights[y * Size + x] >= 30f) t.AllPointsAboveSeaLevel.Add((x, y));
    }

    void GenerateSectors()
    {
        var visited = new bool[Size * Size];
        var stack = new Stack<(short X, short Y)>(1024);
        // One sector each for all of the Ash Lands, Deep North and Ocean.
        var whole = new Dictionary<byte, Sector>(3);
        Sectors.Add(new Sector(this, Biome.AshLands)); whole[6] = Sectors[^1];
        Sectors.Add(new Sector(this, Biome.DeepNorth)); whole[7] = Sectors[^1];
        Sectors.Add(new Sector(this, Biome.Ocean)); whole[8] = Sectors[^1];

        for (short y = 0; y < Size; y++)
            for (short x = 0; x < Size; x++)
            {
                int k = y * Size + x;
                if (whole.TryGetValue(Biomes[k], out var s))
                {
                    PointSectors[k] = s;
                    visited[k] = true;
                    AddPoint(s, x, y);
                }
            }

        // Flood fill the rest, 4-way, depth first from a stack, as the game does.
        for (short y = 0; y < Size; y++)
            for (short x = 0; x < Size; x++)
            {
                int k = y * Size + x;
                if (visited[k]) continue;
                visited[k] = true;
                var sector = new Sector(this, ToBiome(Biomes[k]));
                Sectors.Add(sector);
                PointSectors[k] = sector;
                stack.Push((x, y));
                while (stack.Count > 0)
                {
                    var (px, py) = stack.Pop();
                    int pk = py * Size + px;
                    byte biome = Biomes[pk];
                    var ps = PointSectors[pk]!;
                    TryFill(visited, stack, biome, ps, (short)(px + 1), py);
                    TryFill(visited, stack, biome, ps, (short)(px - 1), py);
                    TryFill(visited, stack, biome, ps, px, (short)(py + 1));
                    TryFill(visited, stack, biome, ps, px, (short)(py - 1));
                }
            }

        // Edges: a point is on its sector's edge when a 4-neighbour is another sector.
        for (int y = 1; y < Size - 1; y++)
            for (int x = 1; x < Size - 1; x++)
            {
                int k = y * Size + x;
                float h = Heights[k];
                var s = PointSectors[k]!;
                Sector item;
                if ((item = PointSectors[k - 1]!) != s || (item = PointSectors[k + 1]!) != s ||
                    (item = PointSectors[k - Size]!) != s || (item = PointSectors[k + Size]!) != s)
                {
                    s.EdgeCount++;
                    s.Center = s.Center + new Vector2(x, y);
                    if (x < s.Min.x) s.Min.x = x;
                    if (x > s.Max.x) s.Max.x = x;
                    if (y < s.Min.y) s.Min.y = y;
                    if (y > s.Max.y) s.Max.y = y;
                    if (!s.Neighbors.Contains(item)) s.Neighbors.Add(item);
                    if (h < s.HeightMin) s.HeightMin = h;
                    if (h > s.HeightMax) s.HeightMax = h;
                }
            }

        foreach (var b in BiomeOrder)
            foreach (var s in Types[b].Sectors)
            {
                if (s.EdgeCount <= 0) continue;
                s.Center = new Vector2(MapToWorld(s.Center.x / s.EdgeCount), MapToWorld(s.Center.y / s.EdgeCount));
                s.Min = new Vector2(MapToWorld(s.Min.x), MapToWorld(s.Min.y));
                s.Max = new Vector2(MapToWorld(s.Max.x), MapToWorld(s.Max.y));
                s.HeightAvg = (float)(((double)s.HeightMin + s.HeightMax) / 2.0);
            }
        foreach (var b in BiomeOrder)
            foreach (var s in Types[b].Sectors)
                s.DistanceFromCenter = Vector2.Distance(s.Center, Vector2.zero);
    }

    void TryFill(bool[] visited, Stack<(short, short)> open, byte biome, Sector sector, short x, short y)
    {
        if (x < 0 || y < 0 || x >= Size || y >= Size) return;
        int k = y * Size + x;
        if (visited[k] || Biomes[k] != biome) return;
        visited[k] = true;
        PointSectors[k] = sector;
        AddPoint(sector, x, y);
        open.Push((x, y));
    }

    /// <summary>GenerateAltBiomes: for each biome, each alt biome valid there, in
    /// order: seed Unity's RNG, shuffle the biome's sectors (cumulatively: the same
    /// list each time), then offer it to each sector in that order.</summary>
    void GenerateAltBiomes(IReadOnlyList<AltBiomeRule> rules, int worldSeed)
    {
        foreach (var r in rules) r.Sectors.Clear();
        var valid = new List<AltBiomeRule>();
        foreach (var b in BiomeOrder)
        {
            valid.Clear();
            foreach (var r in rules)
                if (r.Enabled && (r.Biome & b) == b) valid.Add(r);   // HasFlag(None) is always true
            var sectors = Types[b].Sectors;
            foreach (var r in valid)
            {
                UnityRandom.InitState((int)b + StableHash.GetStableHashCode(r.Name) + worldSeed);
                Shuffle(sectors);
                foreach (var s in sectors)
                {
                    if (r.Sectors.Count >= r.MaxAmountSpawned) continue;
                    float roll = UnityRandom.Range(0f, 1f);
                    if ((r.Sectors.Count < r.MinAmountSpawned || r.Chance >= roll) && CanAddModifier(s, r))
                    {
                        r.Sectors.Add(s);
                        s.AltBiomes.Add(r);
                    }
                }
            }
        }
    }

    /// <summary>The game's Utils.Shuffle (assembly_utils; not ShuffleClass, which a
    /// decompiler shows the call as): Fisher-Yates on Unity's seeded RNG.</summary>
    static void Shuffle(List<Sector> list)
    {
        for (int n = list.Count - 1; n > 0; n--)
        {
            int k = UnityRandom.Range(0, n + 1);
            (list[n], list[k]) = (list[k], list[n]);
        }
    }

    /// <summary>BiomeSector.CanAddModifier, quirks kept: the neighbour loops test
    /// index i against <c>((BiomeIndex)i).ToBiome()</c> flags but compare the
    /// neighbour's Biome with <c>(Biome)i</c>.</summary>
    static bool CanAddModifier(Sector s, AltBiomeRule m)
    {
        if (s.DistanceFromCenter < m.MinDistanceFromCenter) return false;
        if (s.EdgeCount < m.MinEdgeSize) return false;
        if (s.EdgeCount >= m.MaxEdgeSize) return false;
        if (s.HeightAvg < m.MinAvgHeight || s.HeightAvg >= m.MaxAvgHeight) return false;
        if ((m.AboveWorldX != 0f && s.Center.x < m.AboveWorldX) || (m.BelowWorldX != 0f && s.Center.x > m.BelowWorldX) ||
            (m.AboveWorldY != 0f && s.Center.y < m.AboveWorldY) || (m.BelowWorldY != 0f && s.Center.y > m.BelowWorldY))
            return false;
        foreach (var a in s.AltBiomes)
            foreach (var inc in a.IncompatibleAltBiomes)
                if (inc == m.Name) return false;
        foreach (var inc in m.IncompatibleAltBiomes)
            foreach (var a in s.AltBiomes)
                if (a.Name == inc) return false;
        if (m.RequireNeighbor != Biome.None)
        {
            for (int i = 0; i < 10; i++)
            {
                var flag = ToBiome((byte)i);
                if ((m.RequireNeighbor & flag) != flag) continue;
                bool found = false;
                foreach (var n in s.Neighbors)
                    if (n.Biome == (Biome)i) { found = true; break; }
                if (!found) return false;
            }
        }
        if (m.NotNeighbor != Biome.None)
        {
            for (int i = 0; i < 10; i++)
            {
                var flag = ToBiome((byte)i);
                if ((m.NotNeighbor & flag) != flag) continue;
                foreach (var n in s.Neighbors)
                    if (n.Biome == (Biome)i) return false;
            }
        }
        return true;
    }

    // ── What location placement asks ─────────────────────────────────────────

    /// <summary>WorldGenerator.GetBiomeSector(x, z): the sector at a world position, clamped to the grid.</summary>
    public Sector? SectorAt(float wx, float wz)
    {
        int x = Math.Clamp(WorldToMap(wx), 0, Size - 1), y = Math.Clamp(WorldToMap(wz), 0, Size - 1);
        return PointSectors[y * Size + x];
    }

    /// <summary>GetRandomPointByBiomes (draws from UnityRandom).</summary>
    public (short X, short Y) RandomPointByBiomes(Biome biome) => RandomPoint(RandomBiomeFromBiomes(biome));

    /// <summary>GetRandomPointByBiomesAboveSeaLevel (draws from UnityRandom).</summary>
    public (short X, short Y) RandomPointByBiomesAboveSeaLevel(Biome biome)
    {
        var b = RandomBiomeFromBiomes(biome);
        var above = Types[b].AllPointsAboveSeaLevel;
        if (above.Count == 0) return RandomPoint(b);
        return above[UnityRandom.Range(0, above.Count)];
    }

    (short X, short Y) RandomPoint(Biome b)
    {
        var all = Types[b].AllPoints;
        return all[UnityRandom.Range(0, all.Count)];
    }

    /// <summary>RandomBiomeFromBiomes, bugs kept: Range(0, n - 1) never picks the
    /// last candidate, a Plains pick returns Black Forest, and the Ocean branch
    /// tests the Meadows flag.</summary>
    static Biome RandomBiomeFromBiomes(Biome biome)
    {
        if ((biome & (biome - 1)) == 0) return biome;
        Biome[] each = { Biome.Meadows, Biome.Swamp, Biome.Mountain, Biome.BlackForest, Biome.Plains,
                         Biome.AshLands, Biome.DeepNorth, Biome.Ocean, Biome.Mistlands };
        int n = 0;
        foreach (var b in each) if ((biome & b) != 0) n++;
        int pick = UnityRandom.Range(0, n - 1);
        if ((biome & Biome.Meadows) != 0 && pick-- == 0) return Biome.Meadows;
        if ((biome & Biome.Swamp) != 0 && pick-- == 0) return Biome.Swamp;
        if ((biome & Biome.Mountain) != 0 && pick-- == 0) return Biome.Mountain;
        if ((biome & Biome.BlackForest) != 0 && pick-- == 0) return Biome.BlackForest;
        if ((biome & Biome.Plains) != 0 && pick-- == 0) return Biome.BlackForest;
        if ((biome & Biome.AshLands) != 0 && pick-- == 0) return Biome.AshLands;
        if ((biome & Biome.DeepNorth) != 0 && pick-- == 0) return Biome.DeepNorth;
        if ((biome & Biome.Meadows) != 0 && pick-- == 0) return Biome.Ocean;
        return Biome.Mistlands;
    }
}

/// <summary>An alt biome's placement rules (AltBiome), from the game's AltBiomeList.</summary>
public sealed class AltBiomeRule
{
    public string Name = "";
    public bool Enabled = true;
    public Biome Biome;
    public float MinDistanceFromCenter = 1000f;
    public int MinAmountSpawned = 1, MaxAmountSpawned = 10;
    public float Chance = 0.1f;
    public Biome RequireNeighbor, NotNeighbor;
    public List<string> IncompatibleAltBiomes = new();
    public int MinEdgeSize = 50, MaxEdgeSize = 1500;
    public float MinAvgHeight = 30f, MaxAvgHeight = 10000f;
    public float BelowWorldX, AboveWorldX, BelowWorldY, AboveWorldY;
    public List<string> BlockLocationNames = new();
    /// <summary>Sectors it was given (filled by BiomeData.Build).</summary>
    public readonly List<BiomeData.Sector> Sectors = new();
}
