namespace Vh.World.Locations;

/// <summary>
/// The seed finder's boss pass (admin page /auth/seeds): does a seed have at
/// least one altar of every boss inside a north-south <see cref="Corridor"/>?
///
/// Two stages, since the exact answer is slow:
/// <list type="bullet">
/// <item><see cref="Screen"/> (milliseconds): samples biomes on a coarse grid,
/// without rivers, and estimates each boss's chance of an altar in the corridor.
/// A boss's altars go to random points of its biome (within its distance limits),
/// so with a fraction f of those points inside and Quantity altars, the chance is
/// about 1 - (1 - f)^Quantity. A heuristic that only rejects seeds.</item>
/// <item><see cref="Exact"/> (seconds): the game's placement of every prioritized
/// location up to the last boss (earlier types take zones a boss would want),
/// on the full height and biome grid, as <see cref="LocationPlacer"/> does it.</item>
/// </list>
/// The exact placement also gives the traders the page's second pass looks at
/// (Haldor, the Bog Witch): both are prioritized and come before the last boss.
/// One instance per thread (it reuses its grid and rules between seeds).
/// </summary>
public sealed class BossScan
{
    /// <summary>The boss locations, in the order <see cref="Screen"/> reports them.</summary>
    public static readonly string[] Prefabs =
    {
        "Eikthyrnir", "GDKing", "Bonemass", "Dragonqueen", "GoblinKing",
        "Mistlands_DvergrBossEntrance1", "FaderLocation", "DN_Bossroom",
    };

    /// <summary>Traders <see cref="Exact"/> reports too (Haldor, the Bog Witch).</summary>
    public static readonly string[] Traders = { "Vendor_BlackForest", "BogWitch_Camp" };

    /// <summary>Screen grid spacing (m): ~27,000 biome samples over the world.</summary>
    public const float ScreenStep = 128f;
    const float WorldRadius = 10500f;

    readonly int _version;
    readonly LocationRule[] _bosses;
    readonly List<LocationRule> _placed;
    readonly List<AltBiomeRule> _alts;
    WorldGrid? _grid;

    public BossScan(int worldGenVersion)
    {
        _version = worldGenVersion;
        var (rules, alts, _) = LocationRule.LoadEmbedded();
        _alts = alts;
        _bosses = Prefabs.Select(p => rules.First(r => r.Prefab == p && r.Enable)).ToArray();
        // Prioritized types are placed first, in the rules' order; nothing after the last boss matters.
        var prioritized = rules.Where(r => r.Prioritized).ToList();
        int last = prioritized.FindLastIndex(r => Array.IndexOf(Prefabs, r.Prefab) >= 0);
        _placed = prioritized.GetRange(0, last + 1);
    }

    /// <summary>Each boss's estimated chance (0-1) of an altar inside the corridor, in <see cref="Prefabs"/> order.</summary>
    public double[] Screen(int seed, Corridor corridor)
    {
        var wg = WorldGenerator.BiomesOnly(seed, _version);
        int n = _bosses.Length;
        var total = new int[n];
        var inside = new int[n];
        int cells = (int)(2 * WorldRadius / ScreenStep);
        for (int iz = 0; iz < cells; iz++)
        {
            float z = -WorldRadius + (iz + 0.5f) * ScreenStep;
            for (int ix = 0; ix < cells; ix++)
            {
                float x = -WorldRadius + (ix + 0.5f) * ScreenStep;
                float d = MathF.Sqrt(x * x + z * z);
                if (d > WorldRadius) continue;
                var biome = wg.GetBiome(x, z);
                bool inCorridor = corridor.Contains(x, z);
                for (int i = 0; i < n; i++)
                {
                    var r = _bosses[i];
                    if ((r.Biome & biome) == 0) continue;
                    if ((r.MinDistance > 0f && d < r.MinDistance) || (r.MaxDistance > 0f && d > r.MaxDistance)) continue;
                    if ((r.MinDistanceFromCenter > 0f && d < r.MinDistanceFromCenter) ||
                        (r.MaxDistanceFromCenter > 0f && d > r.MaxDistanceFromCenter)) continue;
                    total[i]++;
                    if (inCorridor) inside[i]++;
                }
            }
        }
        var chance = new double[n];
        for (int i = 0; i < n; i++)
            chance[i] = total[i] == 0 ? 0 : 1 - Math.Pow(1 - (double)inside[i] / total[i], _bosses[i].Quantity);
        return chance;
    }

    /// <summary>Every boss altar and <see cref="Traders"/> camp the game places for this seed (exact; seconds).</summary>
    public List<PlacedLocation> Exact(int seed)
    {
        var wg = new WorldGenerator(seed, _version);
        _grid ??= WorldGrid.CreateEmpty();
        FillGrid(wg, _grid);
        var biomes = BiomeData.Build(_grid, seed, _alts);
        var placed = new LocationPlacer(wg, biomes, _placed).RunToEnd();
        var found = new List<PlacedLocation>();
        foreach (var p in placed)
            if (Array.IndexOf(Prefabs, p.Rule.Prefab) >= 0 || Array.IndexOf(Traders, p.Rule.Prefab) >= 0) found.Add(p);
        return found;
    }

    /// <summary>
    /// The minimap sweep BiomeData is built from (as WorldGrid's), minus what
    /// placing up to the bosses never reads: the forest factor, and ocean
    /// heights (they only feed the Ocean's above-sea-level points and the ocean
    /// sector's height range, which no prioritized location or alt biome uses),
    /// a third of the world's cells and most of the cost.
    /// </summary>
    static void FillGrid(WorldGenerator wg, WorldGrid grid)
    {
        const int size = WorldGrid.Size, half = size / 2;
        const float pixel = WorldGrid.PixelSize;
        byte ocean = WorldGrid.BiomeIndex(Biome.Ocean);
        for (int i = 0; i < size; i++)
        {
            float wy = (i - half) * pixel + pixel / 2f;
            int row = i * size;
            for (int j = 0; j < size; j++)
            {
                float wx = (j - half) * pixel + pixel / 2f;
                var b = wg.GetBiome(wx, wy);
                byte index = WorldGrid.BiomeIndex(b);
                grid.Biome[row + j] = index;
                grid.Height[row + j] = index == ocean ? 0f : wg.GetBiomeHeight(b, wx, wy, out _, out _, out _, out _);
            }
        }
    }
}

/// <summary>
/// A band along the world's north-south axis (x = 0) through spawn, from pole
/// to pole: half-width <see cref="HalfWidthCenter"/> at spawn, widening
/// linearly to <see cref="HalfWidthEdge"/> 10 km north or south, except in
/// the Deep North and Ash Lands, where it is <see cref="HalfWidthPolar"/>
/// (narrower, for their bosses). The seed finder page draws and tests the same shape.
/// </summary>
public sealed class Corridor(float halfWidthCenter, float halfWidthEdge, float halfWidthPolar)
{
    public const float EdgeDistance = 10000f;
    public float HalfWidthCenter => halfWidthCenter;
    public float HalfWidthEdge => halfWidthEdge;
    public float HalfWidthPolar => halfWidthPolar;

    public float HalfWidthAt(float z) =>
        halfWidthCenter + (halfWidthEdge - halfWidthCenter) * Math.Min(Math.Abs(z), EdgeDistance) / EdgeDistance;

    public bool Contains(float x, float z) =>
        Math.Abs(x) <= (WorldGenerator.IsDeepnorth(x, z) || WorldGenerator.IsAshlands(x, z) ? halfWidthPolar : HalfWidthAt(z));
}
