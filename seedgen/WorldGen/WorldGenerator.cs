using System;
using System.Collections.Generic;

namespace Vh.World;


public class WorldGenerator
{
    public class River
    {
        public Vector2 p0;
        public Vector2 p1;
        public Vector2 center;
        public float widthMin;
        public float widthMax;
        public float curveWidth;
        public float curveWavelength;
    }

    public struct RiverPoint
    {
        public Vector2 p;
        public float w;
        public float w2;

        public RiverPoint(Vector2 p_p, float p_w)
        {
            p = p_p;
            w = p_w;
            w2 = p_w * p_w;
        }
    }

    private int m_version;
    private float m_offset0;
    private float m_offset1;
    private float m_offset2;
    private float m_offset3;
    private float m_offset4;
    private int m_seed;
    private int m_riverSeed;
    private int m_streamSeed;

    private List<Vector2> m_lakes = new();
    private List<River> m_rivers = new();
    private List<River> m_streams = new();
    private Dictionary<Vector2i, RiverPoint[]> m_riverPoints = new();

    private RiverPoint[]? m_cachedRiverPoints;
    private Vector2i m_cachedRiverGrid = new(-999999, -999999);

    private FastNoise m_noiseGen;

    private float m_minMountainDistance = 1000f;
    private float minDarklandNoise = 0.4f;
    private float maxMarshDistance = 6000f;

    public static readonly float ashlandsMinDistance = 12000f;
    public static readonly float ashlandsYOffset = -4000f;

    public WorldGenerator(int seed, int worldGenVersion)
    {
        m_seed = seed;
        m_version = worldGenVersion;
        VersionSetup(m_version);

        m_noiseGen = new FastNoise(seed);
        m_noiseGen.SetNoiseType(FastNoise.NoiseType.Cellular);
        m_noiseGen.SetCellularDistanceFunction(FastNoise.CellularDistanceFunction.Euclidean);
        m_noiseGen.SetCellularReturnType(FastNoise.CellularReturnType.Distance);
        m_noiseGen.SetFractalOctaves(2);
        m_noiseGen.SetSeed(0);

        UnityRandom.InitState(seed);
        // Original code uses int Range(-10000, 10000), result implicitly cast to float
        m_offset0 = UnityRandom.Range(-10000, 10000);
        m_offset1 = UnityRandom.Range(-10000, 10000);
        m_offset2 = UnityRandom.Range(-10000, 10000);
        m_offset3 = UnityRandom.Range(-10000, 10000);
        m_riverSeed = UnityRandom.Range(int.MinValue, int.MaxValue);
        m_streamSeed = UnityRandom.Range(int.MinValue, int.MaxValue);
        m_offset4 = UnityRandom.Range(-10000, 10000);

        Pregenerate();
    }

    private void VersionSetup(int version)
    {
        if (version <= 0)
            m_minMountainDistance = 1500f;
        if (version <= 1)
        {
            minDarklandNoise = 0.5f;
            maxMarshDistance = 8000f;
        }
    }

    private void Pregenerate()
    {
        FindLakes();
        m_rivers = PlaceRivers();
        m_streams = PlaceStreams();
    }

    // === GetBiome ===

    public Biome GetBiome(float wx, float wy)
    {
        float num = DUtils.Length(wx, wy);
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        float num2 = (float)((double)WorldAngle(wx, wy) * 100.0);

        if (IsAshlands(wx, wy))
            return Biome.AshLands;

        if (baseHeight <= 0.02f)
            return Biome.Ocean;

        if (IsDeepnorth(wx, wy))
        {
            if (baseHeight > 0.4f)
                return Biome.Mountain;
            return Biome.DeepNorth;
        }

        if (baseHeight > 0.4f)
            return Biome.Mountain;

        if (DUtils.PerlinNoise((double)(float)((double)m_offset0 + (double)wx) * 0.0010000000474974513,
                (double)(float)((double)m_offset0 + (double)wy) * 0.0010000000474974513) > 0.6f
            && num > 2000f && num < maxMarshDistance
            && baseHeight > 0.05f && baseHeight < 0.25f)
            return Biome.Swamp;

        if (DUtils.PerlinNoise((double)(float)((double)m_offset4 + (double)wx) * 0.0010000000474974513,
                (double)(float)((double)m_offset4 + (double)wy) * 0.0010000000474974513) > minDarklandNoise
            && num > (float)(6000.0 + (double)num2) && num < 10000f)
            return Biome.Mistlands;

        if (DUtils.PerlinNoise((double)(float)((double)m_offset1 + (double)wx) * 0.0010000000474974513,
                (double)(float)((double)m_offset1 + (double)wy) * 0.0010000000474974513) > 0.4f
            && num > (float)(3000.0 + (double)num2) && num < 8000f)
            return Biome.Plains;

        if (DUtils.PerlinNoise((double)(float)((double)m_offset2 + (double)wx) * 0.0010000000474974513,
                (double)(float)((double)m_offset2 + (double)wy) * 0.0010000000474974513) > 0.4f
            && num > (float)(600.0 + (double)num2) && num < 6000f)
            return Biome.BlackForest;

        if (num > (float)(5000.0 + (double)num2))
            return Biome.BlackForest;

        return Biome.Meadows;
    }

    public static bool IsAshlands(float x, float y)
    {
        double num = (double)WorldAngle(x, y) * 100.0;
        return (double)DUtils.Length(x, (float)((double)y + (double)ashlandsYOffset)) > (double)ashlandsMinDistance + num;
    }

    public static bool IsDeepnorth(float x, float y)
    {
        float num = (float)((double)WorldAngle(x, y) * 100.0);
        return new Vector2(x, (float)((double)y + 4000.0)).magnitude > (float)(12000.0 + (double)num);
    }

    public static float WorldAngle(float wx, float wy)
    {
        return (float)Math.Sin((float)((double)(float)Math.Atan2(wx, wy) * 20.0));
    }

    // === GetBaseHeight ===

    private float GetBaseHeight(float wx, float wy, bool menuTerrain)
    {
        if (menuTerrain)
        {
            double num = wx;
            double num2 = wy;
            num += 100000.0 + (double)m_offset0;
            num2 += 100000.0 + (double)m_offset1;
            float num3 = 0f;
            num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.0020000000949949026 * 0.5, num2 * 0.0020000000949949026 * 0.5) * (double)DUtils.PerlinNoise(num * 0.003000000026077032 * 0.5, num2 * 0.003000000026077032 * 0.5) * 1.0);
            num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.0020000000949949026 * 1.0, num2 * 0.0020000000949949026 * 1.0) * (double)DUtils.PerlinNoise(num * 0.003000000026077032 * 1.0, num2 * 0.003000000026077032 * 1.0) * (double)num3 * 0.8999999761581421);
            num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.004999999888241291 * 1.0, num2 * 0.004999999888241291 * 1.0) * (double)DUtils.PerlinNoise(num * 0.009999999776482582 * 1.0, num2 * 0.009999999776482582 * 1.0) * 0.5 * (double)num3);
            return (float)((double)num3 - 0.07000000029802322);
        }

        float num4 = DUtils.Length(wx, wy);
        double num5 = wx;
        double num6 = wy;
        num5 += 100000.0 + (double)m_offset0;
        num6 += 100000.0 + (double)m_offset1;
        float num7 = 0f;
        num7 = (float)((double)num7 + (double)DUtils.PerlinNoise(num5 * 0.0020000000949949026 * 0.5, num6 * 0.0020000000949949026 * 0.5) * (double)DUtils.PerlinNoise(num5 * 0.003000000026077032 * 0.5, num6 * 0.003000000026077032 * 0.5) * 1.0);
        num7 = (float)((double)num7 + (double)DUtils.PerlinNoise(num5 * 0.0020000000949949026 * 1.0, num6 * 0.0020000000949949026 * 1.0) * (double)DUtils.PerlinNoise(num5 * 0.003000000026077032 * 1.0, num6 * 0.003000000026077032 * 1.0) * (double)num7 * 0.8999999761581421);
        num7 = (float)((double)num7 + (double)DUtils.PerlinNoise(num5 * 0.004999999888241291 * 1.0, num6 * 0.004999999888241291 * 1.0) * (double)DUtils.PerlinNoise(num5 * 0.009999999776482582 * 1.0, num6 * 0.009999999776482582 * 1.0) * 0.5 * (double)num7);
        num7 = (float)((double)num7 - 0.07000000029802322);

        float num8 = DUtils.PerlinNoise(num5 * 0.0020000000949949026 * 0.25 + 0.12300000339746475, num6 * 0.0020000000949949026 * 0.25 + 0.15123000741004944);
        float num9 = DUtils.PerlinNoise(num5 * 0.0020000000949949026 * 0.25 + 0.32100000977516174, num6 * 0.0020000000949949026 * 0.25 + 0.23100000619888306);
        float v = Math.Abs((float)((double)num8 - (double)num9));
        float num10 = (float)(1.0 - (double)DUtils.LerpStep(0.02f, 0.12f, v));
        num10 = (float)((double)num10 * (double)DUtils.SmoothStep(744f, 1000f, num4));
        num7 = (float)((double)num7 * (1.0 - (double)num10));

        if (num4 > 10000f)
        {
            float t = DUtils.LerpStep(10000f, 10500f, num4);
            num7 = DUtils.Lerp(num7, -0.2f, t);
            float num11 = 10490f;
            if (num4 > num11)
            {
                float t2 = DUtils.LerpStep(num11, 10500f, num4);
                num7 = DUtils.Lerp(num7, -2f, t2);
            }
            return num7;
        }

        if (num4 < m_minMountainDistance && num7 > 0.28f)
        {
            float t3 = (float)DUtils.Clamp01(((double)num7 - 0.2800000011920929) / 0.09999999403953552);
            num7 = DUtils.Lerp(DUtils.Lerp(0.28f, 0.38f, t3), num7, DUtils.LerpStep((float)((double)m_minMountainDistance - 400.0), m_minMountainDistance, num4));
        }

        return num7;
    }

    // === GetHeight / GetBiomeArea / GetTerrainDelta (needed for location finding) ===

    public float GetHeight(float wx, float wy)
    {
        Biome biome = GetBiome(wx, wy);
        return GetBiomeHeight(biome, wx, wy, out _, out _, out _, out _);
    }

    public float GetHeight(float wx, float wy, out float maskA)
    {
        Biome biome = GetBiome(wx, wy);
        return GetBiomeHeight(biome, wx, wy, out _, out _, out _, out maskA);
    }

    [Flags]
    public enum BiomeArea { Edge = 1, Median = 2, Everything = 3 }

    public BiomeArea GetBiomeArea(float x, float z)
    {
        Biome center = GetBiome(x, z);
        if (center != GetBiome(x - 64, z - 64)) return BiomeArea.Edge;
        if (center != GetBiome(x + 64, z - 64)) return BiomeArea.Edge;
        if (center != GetBiome(x + 64, z + 64)) return BiomeArea.Edge;
        if (center != GetBiome(x - 64, z + 64)) return BiomeArea.Edge;
        if (center != GetBiome(x - 64, z))      return BiomeArea.Edge;
        if (center != GetBiome(x + 64, z))      return BiomeArea.Edge;
        if (center != GetBiome(x, z - 64))      return BiomeArea.Edge;
        if (center != GetBiome(x, z + 64))      return BiomeArea.Edge;
        return BiomeArea.Median;
    }

    public void GetTerrainDelta(float cx, float cz, float radius, out float delta)
    {
        float hi = -999999f, lo = 999999f;
        for (int i = 0; i < 10; i++)
        {
            var (dx, dy) = UnityRandom.InsideUnitCircle();
            float h = GetHeight(cx + dx * radius, cz + dy * radius);
            if (h < lo) lo = h;
            if (h > hi) hi = h;
        }
        delta = hi - lo;
    }

    /// <summary>
    /// Get Ashlands lava mask using the cheap path (2 iterations instead of 5+3).
    /// This matches the game's Minimap.GetMaskColor which calls GetAshlandsHeight(cheap: true).
    /// </summary>
    public float GetAshlandsLavaMask(float wx, float wy)
    {
        GetAshlandsHeight(wx, wy, out float maskA, cheap: true);
        return maskA;
    }

    public int GetSeed() => m_seed;

    // === GetBiomeHeight (needed for heightTexCache) ===

    public float GetBiomeHeight(Biome biome, float wx, float wy, out float maskR, out float maskG, out float maskB, out float maskA, bool preGeneration = false)
    {
        maskR = 0; maskG = 0; maskB = 0; maskA = 0;
        float num = preGeneration
            ? GetHeightMultiplier()
            : GetHeightMultiplier() * (float)CreateAshlandsGap(wx, wy) * (float)CreateDeepNorthGap(wx, wy);

        if (DUtils.Length(wx, wy) > 10500f)
            return -2f * GetHeightMultiplier();

        switch (biome)
        {
            case Biome.Swamp: return GetMarshHeight(wx, wy) * num;
            case Biome.DeepNorth: return GetDeepNorthHeight(wx, wy) * num;
            case Biome.Mountain: return GetSnowMountainHeight(wx, wy) * num;
            case Biome.BlackForest: return GetForestHeight(wx, wy) * num;
            case Biome.Ocean: return GetOceanHeight(wx, wy) * num;
            case Biome.AshLands: return (preGeneration ? GetAshlandsHeightPregenerate(wx, wy) : GetAshlandsHeight(wx, wy, out maskA)) * num;
            case Biome.Plains: return GetPlainsHeight(wx, wy) * num;
            case Biome.Meadows: return GetMeadowsHeight(wx, wy) * num;
            case Biome.Mistlands: return (preGeneration ? GetForestHeight(wx, wy) : GetMistlandsHeight(wx, wy, out maskA)) * num;
            default: return 0f;
        }
    }

    // === Per-biome height functions (exact port) ===

    private float GetMarshHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float num = 0.137f;
        wx = (float)((double)wx + 100000.0);
        wy = (float)((double)wy + 100000.0);
        double num2 = wx, num3 = wy;
        float num4 = (float)((double)DUtils.PerlinNoise(num2 * 0.03999999910593033, num3 * 0.03999999910593033) * (double)DUtils.PerlinNoise(num2 * 0.07999999821186066, num3 * 0.07999999821186066));
        num = (float)((double)num + (double)num4 * 0.029999999329447746);
        num = AddRivers(wx2, wy2, num);
        num = (float)((double)num + (double)DUtils.PerlinNoise(num2 * 0.10000000149011612, num3 * 0.10000000149011612) * 0.009999999776482582);
        return (float)((double)num + (double)DUtils.PerlinNoise(num2 * 0.4000000059604645, num3 * 0.4000000059604645) * 0.003000000026077032);
    }

    private float GetMeadowsHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = (float)((double)DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164));
        num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * (double)num3 * 0.5);
        float num4 = baseHeight;
        num4 = (float)((double)num4 + (double)num3 * 0.10000000149011612);
        float num5 = 0.15f;
        float num6 = (float)((double)num4 - (double)num5);
        float num7 = (float)DUtils.Clamp01((double)baseHeight / 0.4000000059604645);
        if (num6 > 0f)
            num4 = (float)((double)num4 - (double)num6 * ((1.0 - (double)num7) * 0.75));
        num4 = AddRivers(wx2, wy2, num4);
        num4 = (float)((double)num4 + (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * 0.009999999776482582);
        return (float)((double)num4 + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.003000000026077032);
    }

    private float GetForestHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = (float)((double)DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164));
        num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * (double)num3 * 0.5);
        baseHeight = (float)((double)baseHeight + (double)num3 * 0.10000000149011612);
        baseHeight = AddRivers(wx2, wy2, baseHeight);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * 0.009999999776482582);
        return (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.003000000026077032);
    }

    private float GetPlainsHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = (float)((double)DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164));
        num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * (double)num3 * 0.5);
        float num4 = baseHeight;
        num4 = (float)((double)num4 + (double)num3 * 0.10000000149011612);
        float num5 = 0.15f;
        float num6 = num4 - num5;
        float num7 = (float)DUtils.Clamp01((double)baseHeight / 0.4000000059604645);
        if (num6 > 0f)
            num4 = (float)((double)num4 - (double)num6 * (1.0 - (double)num7) * 0.75);
        num4 = AddRivers(wx2, wy2, num4);
        num4 = (float)((double)num4 + (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * 0.009999999776482582);
        return (float)((double)num4 + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.003000000026077032);
    }

    private float GetSnowMountainHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        float tilt = BaseHeightTilt(wx, wy);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num2 = wx, num3 = wy;
        float num4 = (float)((double)baseHeight - 0.4000000059604645);
        baseHeight = (float)((double)baseHeight + (double)num4);
        float num5 = (float)((double)DUtils.PerlinNoise(num2 * 0.009999999776482582, num3 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num2 * 0.019999999552965164, num3 * 0.019999999552965164));
        num5 = (float)((double)num5 + (double)DUtils.PerlinNoise(num2 * 0.05000000074505806, num3 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num2 * 0.10000000149011612, num3 * 0.10000000149011612) * (double)num5 * 0.5);
        baseHeight = (float)((double)baseHeight + (double)num5 * 0.20000000298023224);
        baseHeight = AddRivers(wx2, wy2, baseHeight);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num2 * 0.10000000149011612, num3 * 0.10000000149011612) * 0.009999999776482582);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num2 * 0.4000000059604645, num3 * 0.4000000059604645) * 0.003000000026077032);
        return (float)((double)baseHeight + (double)DUtils.PerlinNoise(num2 * 0.20000000298023224, num3 * 0.20000000298023224) * 2.0 * (double)tilt);
    }

    private float GetDeepNorthHeight(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = Math.Max(0f, (float)((double)baseHeight - 0.4000000059604645));
        baseHeight = (float)((double)baseHeight + (double)num3);
        float num4 = (float)((double)DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164));
        num4 = (float)((double)num4 + (double)DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * (double)num4 * 0.5);
        baseHeight = (float)((double)baseHeight + (double)num4 * 0.20000000298023224);
        baseHeight = (float)((double)baseHeight * 1.2000000476837158);
        baseHeight = AddRivers(wx2, wy2, baseHeight);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(wx * 0.1f, wy * 0.1f) * 0.009999999776482582);
        return (float)((double)baseHeight + (double)DUtils.PerlinNoise(wx * 0.4f, wy * 0.4f) * 0.003000000026077032);
    }

    private float GetOceanHeight(float wx, float wy)
    {
        return GetBaseHeight(wx, wy, menuTerrain: false);
    }

    private float GetMistlandsHeight(float wx, float wy, out float maskAlpha)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = DUtils.PerlinNoise(num * 0.019999999552965164 * 0.699999988079071, num2 * 0.019999999552965164 * 0.699999988079071) * DUtils.PerlinNoise(num * 0.03999999910593033 * 0.699999988079071, num2 * 0.03999999910593033 * 0.699999988079071);
        num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.029999999329447746 * 0.699999988079071, num2 * 0.029999999329447746 * 0.699999988079071) * (double)DUtils.PerlinNoise(num * 0.05000000074505806 * 0.699999988079071, num2 * 0.05000000074505806 * 0.699999988079071) * (double)num3 * 0.5);
        num3 = (num3 > 0f) ? (float)Math.Pow(num3, 1.5) : num3;
        baseHeight = (float)((double)baseHeight + (double)num3 * 0.4000000059604645);
        baseHeight = AddRivers(wx2, wy2, baseHeight);
        float num4 = (float)DUtils.Clamp01((double)num3 * 7.0);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * 0.029999999329447746 * (double)num4);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.009999999776482582 * (double)num4);
        float num5 = (float)(1.0 - (double)num4 * 1.2000000476837158);
        num5 = (float)((double)num5 - (1.0 - (double)DUtils.LerpStep(0.1f, 0.3f, num4)));
        float a = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.0020000000949949026);
        float num6 = baseHeight;
        num6 = (float)((double)num6 * 400.0);
        num6 = (float)Math.Ceiling(num6);
        num6 = (float)((double)num6 / 400.0);
        baseHeight = DUtils.Lerp(a, num6, num4);
        maskAlpha = num5;
        return baseHeight;
    }

    private float GetAshlandsHeightPregenerate(float wx, float wy)
    {
        float wx2 = wx, wy2 = wy;
        float baseHeight = GetBaseHeight(wx, wy, menuTerrain: false);
        wx = (float)((double)wx + 100000.0 + (double)m_offset3);
        wy = (float)((double)wy + 100000.0 + (double)m_offset3);
        double num = wx, num2 = wy;
        float num3 = (float)((double)DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * (double)DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164));
        num3 = (float)((double)num3 + (double)DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * (double)num3 * 0.5);
        baseHeight = (float)((double)baseHeight + (double)num3 * 0.10000000149011612 + 0.10000000149011612);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612) * 0.009999999776482582);
        baseHeight = (float)((double)baseHeight + (double)DUtils.PerlinNoise(num * 0.4000000059604645, num2 * 0.4000000059604645) * 0.003000000026077032);
        baseHeight = AddRivers(wx2, wy2, baseHeight);
        return baseHeight;
    }

    private float GetAshlandsHeight(float wx, float wy, out float maskAlpha, bool cheap = false)
    {
        double num = wx;
        double num2 = wy;
        double a = GetBaseHeight((float)num, (float)num2, menuTerrain: false);
        double num3 = (double)WorldAngle((float)num, (float)num2) * 100.0;
        double value = DUtils.Length(num, num2 + (double)ashlandsYOffset - (double)ashlandsYOffset * 0.3) - ((double)ashlandsMinDistance + num3);
        value = Math.Abs(value) / 1000.0;
        value = 1.0 - DUtils.Clamp01(value);
        value = DUtils.MathfLikeSmoothStep(0.1, 1.0, value);
        double num4 = Math.Abs(num);
        num4 = 1.0 - DUtils.Clamp01(num4 / 7500.0);
        value *= num4;
        double num5 = DUtils.Length(num, num2) - 10150.0;
        num5 = 1.0 - DUtils.Clamp01(num5 / 600.0);
        num += (double)(100000f + m_offset3);
        num2 += (double)(100000f + m_offset3);
        double num6 = 0.0;
        double num7 = 1.0;
        double num8 = 0.33000001311302185;
        int num9 = cheap ? 2 : 5;
        for (int i = 0; i < num9; i++)
        {
            num6 += num7 * DUtils.MathfLikeSmoothStep(0.0, 1.0, m_noiseGen.GetCellular(num * num8, num2 * num8));
            num8 *= 2.0;
            num7 *= 0.5;
        }
        num6 = DUtils.Remap(num6, -1.0, 1.0, 0.0, 1.0);
        double num10 = DUtils.Lerp(value, DUtils.BlendOverlay(value, num6), 0.5);
        double num11 = DUtils.PerlinNoise(num * 0.009999999776482582, num2 * 0.009999999776482582) * DUtils.PerlinNoise(num * 0.019999999552965164, num2 * 0.019999999552965164);
        num11 += (double)(DUtils.PerlinNoise(num * 0.05000000074505806, num2 * 0.05000000074505806) * DUtils.PerlinNoise(num * 0.10000000149011612, num2 * 0.10000000149011612)) * num11 * 0.5;
        double num12 = DUtils.Lerp(a, 0.15000000596046448, 0.75);
        num12 += num10 * 0.5;
        num12 = DUtils.Lerp(-1.0, num12, DUtils.MathfLikeSmoothStep(0.0, 1.0, num5));
        double num13 = 0.15;
        double num14 = 0.0;
        double num15 = 1.0;
        double num16 = 8.0;
        int num17 = cheap ? 2 : 3;
        for (int j = 0; j < num17; j++)
        {
            num14 += num15 * m_noiseGen.GetCellular(num * num16, num2 * num16);
            num16 *= 2.0;
            num15 *= 0.5;
        }
        num14 = DUtils.Remap(num14, -1.0, 1.0, 0.0, 1.0);
        num14 = DUtils.Clamp01(Math.Pow(num14, 4.0) * 2.0);
        double simplexFractal = m_noiseGen.GetSimplexFractal(num * 0.075, num2 * 0.075);
        simplexFractal = DUtils.Remap(simplexFractal, -1.0, 1.0, 0.0, 1.0);
        simplexFractal = Math.Pow(simplexFractal, 1.399999976158142);
        num12 *= simplexFractal;
        double num18 = DUtils.Fbm(new Vector2((float)(num * 0.009999999776482582), (float)(num2 * 0.009999999776482582)), 3, 2.0, 0.5);
        num18 *= DUtils.Clamp01(DUtils.Remap(value, 0.0, 0.5, 0.5, 1.0));
        num18 = DUtils.LerpStep(0.699999988079071, 1.0, num18);
        num18 = Math.Pow(num18, 2.0);
        double num19 = DUtils.BlendOverlay(num18, num14);
        num19 *= DUtils.Clamp01((num12 - num13 - 0.02) / 0.01);
        double x = DUtils.PerlinNoise(num * 0.05 + 5124.0, num2 * 0.05 + 5000.0);
        x = Math.Pow(x, 2.0);
        x = DUtils.Remap(x, 0.0, 1.0, 0.009999999776482582, 0.054999999701976776);
        double b = Math.Clamp((float)(num12 - x), (float)(num13 + 0.009999999776482582), 5000f);
        num12 = DUtils.Lerp(num12, b, num19);
        maskAlpha = (float)num19;
        return (float)num12;
    }

    private float BaseHeightTilt(float wx, float wy)
    {
        float a = GetBaseHeight(wx - 1f, wy, menuTerrain: false);
        float b = GetBaseHeight(wx + 1f, wy, menuTerrain: false);
        float c = GetBaseHeight(wx, wy - 1f, menuTerrain: false);
        float d = GetBaseHeight(wx, wy + 1f, menuTerrain: false);
        return Math.Abs(b - a) + Math.Abs(c - d);
    }

    private double CreateAshlandsGap(float wx, float wy)
    {
        double num = (double)WorldAngle(wx, wy) * 100.0;
        double value = (double)DUtils.Length(wx, wy + ashlandsYOffset) - ((double)ashlandsMinDistance + num);
        value = DUtils.Clamp01(Math.Abs(value) / 400.0);
        return DUtils.MathfLikeSmoothStep(0.0, 1.0, (float)value);
    }

    private double CreateDeepNorthGap(float wx, float wy)
    {
        double num = (double)WorldAngle(wx, wy) * 100.0;
        double value = (double)DUtils.Length(wx, wy + 4000f) - (12000.0 + num);
        value = DUtils.Clamp01(Math.Abs(value) / 400.0);
        return DUtils.MathfLikeSmoothStep(0.0, 1.0, (float)value);
    }

    public static float GetHeightMultiplier() => 200f;

    // === Forest factor (for mask texture) ===

    public static bool InForest(Vector3 pos)
    {
        return GetForestFactor(pos) < 1.15f;
    }

    public static float GetForestFactor(Vector3 pos)
    {
        float num = 0.4f;
        // Game does: pos * 0.01f * num — multiplication order matters for float precision
        return DUtils.Fbm(pos * 0.01f * num, 3, 1.6f, 0.7f);
    }

    public static float GetAshlandsOceanGradient(float x, float y)
    {
        double num = (double)WorldAngle(x, y + ashlandsYOffset) * 100.0;
        return (float)(((double)DUtils.Length(x, y + ashlandsYOffset) - ((double)ashlandsMinDistance + num)) / 300.0);
    }

    // === River system ===

    private float AddRivers(float wx, float wy, float h)
    {
        GetRiverWeight(wx, wy, out var weight, out var width);
        if (weight <= 0f) return h;
        float t = DUtils.LerpStep(20f, 60f, width);
        float num = DUtils.Lerp(0.14f, 0.12f, t);
        float num2 = DUtils.Lerp(0.139f, 0.128f, t);
        if (h > num)
            h = DUtils.Lerp(h, num, weight);
        if (h > num2)
        {
            float t2 = DUtils.LerpStep(0.85f, 1f, weight);
            h = DUtils.Lerp(h, num2, t2);
        }
        return h;
    }

    private void GetRiverWeight(float wx, float wy, out float weight, out float width)
    {
        Vector2i grid = GetRiverGrid(wx, wy);
        if (m_riverPoints.TryGetValue(grid, out var points))
        {
            GetWeight(points, wx, wy, out weight, out width);
        }
        else
        {
            weight = 0f;
            width = 0f;
        }
    }

    private void GetWeight(RiverPoint[] points, float wx, float wy, out float weight, out float width)
    {
        Vector2 vector = new(wx, wy);
        weight = 0f;
        width = 0f;
        float num = 0f;
        float num2 = 0f;
        for (int i = 0; i < points.Length; i++)
        {
            RiverPoint rp = points[i];
            float sqr = Vector2.SqrMagnitude(rp.p - vector);
            if (sqr < rp.w2)
            {
                float dist = (float)Math.Sqrt(sqr);
                float w = 1.0f - dist / rp.w;
                if (w > weight) weight = w;
                num += rp.w * w;
                num2 += w;
            }
        }
        if (num2 > 0f) width = num / num2;
    }

    private float GetPregenerationHeight(float wx, float wy)
    {
        Biome biome = GetBiome(wx, wy);
        return GetBiomeHeight(biome, wx, wy, out _, out _, out _, out _, preGeneration: true);
    }

    // === Lake/River generation ===

    private void FindLakes()
    {
        List<Vector2> list = new();
        for (float num = -10000f; num <= 10000f; num += 128f)
        {
            for (float num2 = -10000f; num2 <= 10000f; num2 += 128f)
            {
                if (!(new Vector2(num2, num).magnitude > 10000f) && GetBaseHeight(num2, num, menuTerrain: false) < 0.05f)
                    list.Add(new Vector2(num2, num));
            }
        }
        m_lakes = MergePoints(list, 800f);
    }

    private List<Vector2> MergePoints(List<Vector2> points, float range)
    {
        List<Vector2> list = new();
        while (points.Count > 0)
        {
            Vector2 vector = points[0];
            points.RemoveAt(0);
            while (points.Count > 0)
            {
                int num = FindClosest(points, vector, range);
                if (num == -1) break;
                vector = (vector + points[num]) * 0.5f;
                points[num] = points[points.Count - 1];
                points.RemoveAt(points.Count - 1);
            }
            list.Add(vector);
        }
        return list;
    }

    private int FindClosest(List<Vector2> points, Vector2 p, float maxDistance)
    {
        int result = -1;
        float num = 99999f;
        for (int i = 0; i < points.Count; i++)
        {
            if (points[i] != p)
            {
                float d = Vector2.Distance(p, points[i]);
                if (d < maxDistance && d < num) { result = i; num = d; }
            }
        }
        return result;
    }

    private List<River> PlaceRivers()
    {
        var savedState = UnityRandom.GetState();
        UnityRandom.InitState(m_riverSeed);
        List<River> list = new();
        List<Vector2> list2 = new(m_lakes);
        while (list2.Count > 1)
        {
            Vector2 vector = list2[0];
            int num = FindRandomRiverEnd(list, m_lakes, vector, 2000f, 0.4f, 128f);
            if (num == -1 && !HaveRiver(list, vector))
                num = FindRandomRiverEnd(list, m_lakes, vector, 5000f, 0.4f, 128f);
            if (num != -1)
            {
                River river = new();
                river.p0 = vector;
                river.p1 = m_lakes[num];
                river.center = (river.p0 + river.p1) * 0.5f;
                river.widthMax = UnityRandom.Range(60f, 100f);
                river.widthMin = UnityRandom.Range(60f, river.widthMax);
                float dist = Vector2.Distance(river.p0, river.p1);
                river.curveWidth = dist / 15f;
                river.curveWavelength = dist / 20f;
                list.Add(river);
            }
            else
            {
                list2.RemoveAt(0);
            }
        }
        RenderRivers(list);
        UnityRandom.SetState(savedState.Item1, savedState.Item2, savedState.Item3, savedState.Item4);
        return list;
    }

    private List<River> PlaceStreams()
    {
        var savedState = UnityRandom.GetState();
        UnityRandom.InitState(m_streamSeed);
        List<River> list = new();
        for (int i = 0; i < 3000; i++)
        {
            if (FindStreamStartPoint(100, 26f, 31f, out var p, out var _)
                && FindStreamEndPoint(100, 36f, 44f, p, 80f, 200f, out var end))
            {
                Vector2 center = (p + end) * 0.5f;
                float h = GetPregenerationHeight(center.x, center.y);
                if (!(h < 26f) && !(h > 44f))
                {
                    River river = new();
                    river.p0 = p;
                    river.p1 = end;
                    river.center = center;
                    river.widthMax = 20f;
                    river.widthMin = 20f;
                    float d = Vector2.Distance(river.p0, river.p1);
                    river.curveWidth = d / 15f;
                    river.curveWavelength = d / 20f;
                    list.Add(river);
                }
            }
        }
        RenderRivers(list);
        UnityRandom.SetState(savedState.Item1, savedState.Item2, savedState.Item3, savedState.Item4);
        return list;
    }

    private bool FindStreamStartPoint(int iterations, float minHeight, float maxHeight, out Vector2 p, out float starth)
    {
        for (int i = 0; i < iterations; i++)
        {
            float x = UnityRandom.Range(-10000f, 10000f);
            float y = UnityRandom.Range(-10000f, 10000f);
            float h = GetPregenerationHeight(x, y);
            if (h > minHeight && h < maxHeight)
            {
                p = new Vector2(x, y);
                starth = h;
                return true;
            }
        }
        p = Vector2.zero;
        starth = 0f;
        return false;
    }

    private bool FindStreamEndPoint(int iterations, float minHeight, float maxHeight, Vector2 start, float minLength, float maxLength, out Vector2 end)
    {
        float step = (maxLength - minLength) / iterations;
        float len = maxLength;
        for (int i = 0; i < iterations; i++)
        {
            len -= step;
            float angle = UnityRandom.Range(0f, MathF.PI * 2f);
            Vector2 point = start + new Vector2(MathF.Sin(angle), MathF.Cos(angle)) * len;
            float h = GetPregenerationHeight(point.x, point.y);
            if (h > minHeight && h < maxHeight)
            {
                end = point;
                return true;
            }
        }
        end = Vector2.zero;
        return false;
    }

    private int FindRandomRiverEnd(List<River> rivers, List<Vector2> points, Vector2 p, float maxDistance, float heightLimit, float checkStep)
    {
        List<int> list = new();
        for (int i = 0; i < points.Count; i++)
        {
            if (points[i] != p && Vector2.Distance(p, points[i]) < maxDistance
                && !HaveRiver(rivers, p, points[i])
                && IsRiverAllowed(p, points[i], checkStep, heightLimit))
                list.Add(i);
        }
        if (list.Count == 0) return -1;
        return list[UnityRandom.Range(0, list.Count)];
    }

    private bool HaveRiver(List<River> rivers, Vector2 p0)
    {
        foreach (var r in rivers)
            if (r.p0 == p0 || r.p1 == p0) return true;
        return false;
    }

    private bool HaveRiver(List<River> rivers, Vector2 p0, Vector2 p1)
    {
        foreach (var r in rivers)
            if ((r.p0 == p0 && r.p1 == p1) || (r.p0 == p1 && r.p1 == p0)) return true;
        return false;
    }

    private bool IsRiverAllowed(Vector2 p0, Vector2 p1, float step, float heightLimit)
    {
        float num = Vector2.Distance(p0, p1);
        Vector2 dir = (p1 - p0).normalized;
        bool flag = true;
        for (float s = step; s <= num - step; s += step)
        {
            Vector2 v = p0 + dir * s;
            float h = GetBaseHeight(v.x, v.y, menuTerrain: false);
            if (h > heightLimit) return false;
            if (h > 0.05f) flag = false;
        }
        return !flag;
    }

    private void RenderRivers(List<River> rivers)
    {
        Dictionary<Vector2i, List<RiverPoint>> dictionary = new();
        foreach (var river in rivers)
        {
            float step = river.widthMin / 8f;
            Vector2 dir = (river.p1 - river.p0).normalized;
            Vector2 perp = new(-dir.y, dir.x);
            float dist = Vector2.Distance(river.p0, river.p1);
            for (float t = 0f; t <= dist; t += step)
            {
                float freq = t / river.curveWavelength;
                float offset = (float)(Math.Sin(freq) * Math.Sin(freq * 0.634119987487793) * Math.Sin(freq * 0.3341200053691864) * river.curveWidth);
                float r = UnityRandom.Range(river.widthMin, river.widthMax);
                Vector2 point = river.p0 + dir * t + perp * offset;
                AddRiverPoint(dictionary, point, r, river);
            }
        }
        foreach (var kvp in dictionary)
        {
            if (m_riverPoints.TryGetValue(kvp.Key, out var existing))
            {
                var combined = new List<RiverPoint>(existing);
                combined.AddRange(kvp.Value);
                m_riverPoints[kvp.Key] = combined.ToArray();
            }
            else
            {
                m_riverPoints[kvp.Key] = kvp.Value.ToArray();
            }
        }
    }

    private void AddRiverPoint(Dictionary<Vector2i, List<RiverPoint>> riverPoints, Vector2 p, float r, River river)
    {
        Vector2i grid = GetRiverGrid(p.x, p.y);
        int num = (int)Math.Ceiling(r / 64f);
        for (int i = grid.y - num; i <= grid.y + num; i++)
        {
            for (int j = grid.x - num; j <= grid.x + num; j++)
            {
                Vector2i g = new(j, i);
                if (InsideRiverGrid(g, p, r))
                    AddRiverPoint(riverPoints, g, p, r);
            }
        }
    }

    private void AddRiverPoint(Dictionary<Vector2i, List<RiverPoint>> riverPoints, Vector2i grid, Vector2 p, float r)
    {
        if (!riverPoints.TryGetValue(grid, out var list))
        {
            list = new List<RiverPoint>();
            riverPoints[grid] = list;
        }
        list.Add(new RiverPoint(p, r));
    }

    private bool InsideRiverGrid(Vector2i grid, Vector2 p, float r)
    {
        Vector2 gridCenter = new(grid.x * 64f, grid.y * 64f);
        Vector2 diff = p - gridCenter;
        return Math.Abs(diff.x) < r + 32f && Math.Abs(diff.y) < r + 32f;
    }

    private Vector2i GetRiverGrid(float wx, float wy)
    {
        int x = (int)MathF.Floor((wx + 32f) / 64f);
        int y = (int)MathF.Floor((wy + 32f) / 64f);
        return new Vector2i(x, y);
    }
}
