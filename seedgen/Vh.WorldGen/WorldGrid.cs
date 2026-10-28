namespace Vh.World;

/// <summary>
/// The world sampled on the game's 2048×2048 minimap grid: each cell's height,
/// biome and forest factor. The same sweep the oracle plugin makes in the game
/// (<c>DumpWorld</c> in seedgen/oracle/OraclePlugin.cs), with the same calls and
/// layout, so the two compare byte for byte.
///
/// Layout: row-major, <c>index = i * Size + j</c>, <c>i</c> the north axis (row 0
/// is the south edge), cell centre <c>world = (k - Size/2) * PixelSize + PixelSize/2</c>.
/// </summary>
public sealed class WorldGrid
{
    public const int Size = 2048;
    public const float PixelSize = 12f;

    /// <summary><c>GetBiomeHeight</c>: raw world height.</summary>
    public float[] Height { get; }
    /// <summary>Dense biome index (<see cref="BiomeIndex"/>).</summary>
    public byte[] Biome { get; }
    /// <summary><c>GetForestFactor</c>.</summary>
    public float[] Forest { get; }

    /// <summary>An empty grid to fill row by row (MapArtifacts.FillTextures fills height and biome).</summary>
    public static WorldGrid CreateEmpty() => new(new float[Size * Size], new byte[Size * Size], new float[Size * Size]);

    WorldGrid(float[] height, byte[] biome, float[] forest)
    {
        Height = height;
        Biome = biome;
        Forest = forest;
    }

    /// <summary>Sweep rows <paramref name="rowFrom"/> to <paramref name="rowTo"/> (exclusive) only,
    /// e.g. to split the work across threads or Web Workers; other rows stay zero.</summary>
    public static WorldGrid Generate(WorldGenerator wg, int rowFrom = 0, int rowTo = Size)
    {
        var height = new float[Size * Size];
        var biome = new byte[Size * Size];
        var forest = new float[Size * Size];
        Fill(wg, height, biome, forest, rowFrom, rowTo);
        return new WorldGrid(height, biome, forest);
    }

    /// <summary>All rows, split across threads, each with its own generator: a
    /// <see cref="WorldGenerator"/> caches its last river lookup, so one instance
    /// can't be shared. They're built one at a time, because construction runs
    /// on the global <see cref="Vh.Numerics.UnityRandom"/> state, as in the game.</summary>
    public static WorldGrid GenerateParallel(int seed, int worldGenVersion)
    {
        var height = new float[Size * Size];
        var biome = new byte[Size * Size];
        var forest = new float[Size * Size];
        int parts = Math.Clamp(Environment.ProcessorCount, 1, 16);
        var gens = Enumerable.Range(0, parts).Select(_ => new WorldGenerator(seed, worldGenVersion)).ToArray();
        int rows = (Size + parts - 1) / parts;
        Parallel.For(0, parts, p => Fill(gens[p], height, biome, forest, p * rows, Math.Min(Size, p * rows + rows)));
        return new WorldGrid(height, biome, forest);
    }

    static void Fill(WorldGenerator wg, float[] height, byte[] biome, float[] forest, int rowFrom, int rowTo)
    {
        const int half = Size / 2;
        const float halfPixel = PixelSize / 2f;
        for (int i = rowFrom; i < rowTo; i++)
        {
            float wy = (i - half) * PixelSize + halfPixel;
            int row = i * Size;
            for (int j = 0; j < Size; j++)
            {
                float wx = (j - half) * PixelSize + halfPixel;
                var b = wg.GetBiome(wx, wy);
                // Minimap.GenerateWorldMap's call: preGeneration=false, riverPreDN=true.
                float h = wg.GetBiomeHeight(b, wx, wy, out _, out _, out _, out _);
                int k = row + j;
                height[k] = h;
                biome[k] = BiomeIndex(b);
                forest[k] = WorldGenerator.GetForestFactor(new Vector3(wx, 0f, wy));
            }
        }
    }

    /// <summary>The oracle's dense biome index (0 = none).</summary>
    public static byte BiomeIndex(Biome b) => b switch
    {
        World.Biome.Meadows => 1,
        World.Biome.Swamp => 2,
        World.Biome.Mountain => 3,
        World.Biome.BlackForest => 4,
        World.Biome.Plains => 5,
        World.Biome.AshLands => 6,
        World.Biome.DeepNorth => 7,
        World.Biome.Ocean => 8,
        World.Biome.Mistlands => 9,
        _ => 0,
    };
}
