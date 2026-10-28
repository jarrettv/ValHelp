using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using Vh.Numerics;
using Vh.World;

[assembly: SupportedOSPlatform("browser")]

namespace Vh.WorldGen.Wasm;

/// <summary>What JavaScript calls. Grids come back as raw little-endian bytes
/// in WorldGrid's layout (rows <c>rowFrom..rowTo</c> only, so workers can split it).</summary>
public static partial class Exports
{
    public static void Main() { }

    /// <summary>Valheim's seed hash of a seed name.</summary>
    [JSExport]
    public static int SeedHash(string seedName) => StableHash.GetStableHashCode(seedName);

    /// <summary>Heights (float32), biomes (uint8, WorldGrid.BiomeIndex) and forest
    /// (float32) for rows rowFrom..rowTo, concatenated: 4n + n + 4n bytes for n cells.</summary>
    /// JavaScript gets a view of managed memory: copy it (<c>view.slice()</c>), then <c>view.dispose()</c>.
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<byte> GridRows(int seed, int worldGenVersion, int rowFrom, int rowTo)
    {
        var grid = WorldGrid.Generate(Generator(seed, worldGenVersion), rowFrom, rowTo);
        int from = rowFrom * WorldGrid.Size, n = (rowTo - rowFrom) * WorldGrid.Size;
        var bytes = new byte[n * 9];
        Buffer.BlockCopy(grid.Height, from * 4, bytes, 0, n * 4);
        Buffer.BlockCopy(grid.Biome, from, bytes, n * 4, n);
        Buffer.BlockCopy(grid.Forest, from * 4, bytes, n * 5, n * 4);
        return bytes;
    }

    /// <summary>
    /// A seed's whole map in one go (one thread): the compressed vector map the
    /// web map draws, as seedgen's ArtifactGenerator makes it. <paramref name="timings"/>
    /// gets "generator,textures,bvec" in milliseconds.
    /// </summary>
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<byte> MapBvec(int seed, int worldGenVersion, [JSMarshalAs<JSType.Function<JSType.String>>] Action<string> timings)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var wg = Generator(seed, worldGenVersion);
        long tGen = sw.ElapsedMilliseconds;
        var map = Vh.Rendering.MapArtifacts.NewMap();
        var mask = Vh.Rendering.MapArtifacts.NewRgba();
        var height = Vh.Rendering.MapArtifacts.NewRgba();
        Vh.Rendering.MapArtifacts.FillTextures(wg, map, mask, height);
        long tTex = sw.ElapsedMilliseconds;
        var bvec = Vh.Rendering.MapArtifacts.Bvec(map, mask, height);
        timings($"{tGen},{tTex - tGen},{sw.ElapsedMilliseconds - tTex}");
        return bvec;
    }

    // ── A map in steps, so a Web Worker can report progress ──────────────────
    // MapStart, then MapRows over the rows in bands, then MapVectors and MapMask.

    static byte[]? s_map, s_mask, s_height;
    static WorldGrid? s_grid;
    static Vh.World.Locations.LocationPlacer? s_placer;
    static Vh.World.Locations.BiomeData? s_biomes;

    /// <summary>Build the seed's generator (lakes, rivers, streams; the slow first second) and blank textures.</summary>
    [JSExport]
    public static void MapStart(int seed, int worldGenVersion)
    {
        s_last = null;
        Generator(seed, worldGenVersion);
        s_map = Vh.Rendering.MapArtifacts.NewMap();
        s_mask = Vh.Rendering.MapArtifacts.NewRgba();
        s_height = Vh.Rendering.MapArtifacts.NewRgba();
        s_grid = WorldGrid.CreateEmpty();
        s_placer = null;
        s_biomes = null;
    }

    /// <summary>Fill texture rows rowFrom..rowTo (of 2048).</summary>
    [JSExport]
    public static void MapRows(int rowFrom, int rowTo) =>
        Vh.Rendering.MapArtifacts.FillTextures(s_last!.Value.Wg, s_map!, s_mask!, s_height!, rowFrom, rowTo, s_grid);

    /// <summary>The compressed vector map (bvec), once every row is filled.</summary>
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<byte> MapVectors() => Vh.Rendering.MapArtifacts.Bvec(s_map!, s_mask!, s_height!);

    /// <summary>The forest/mask texture, RGBA, bottom-up (row 0 = south), as seedgen's forestMaskTexCache before PNG.</summary>
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<byte> MapMask() => s_mask!;

    // ── Locations, after every row is filled ─────────────────────────────────
    // LocationsStart, then LocationsRun repeatedly (each call works for a time
    // budget and returns progress), then LocationsJson.

    /// <summary>Build the biome sectors and alt biomes from the filled grid, and a placer
    /// with the game's rules (embedded; their game version is returned).</summary>
    [JSExport]
    public static string LocationsStart()
    {
        var (rules, alts, version) = Vh.World.Locations.LocationRule.LoadEmbedded();
        var wg = s_last!.Value.Wg;
        var biomes = s_biomes = Vh.World.Locations.BiomeData.Build(s_grid!, wg.GetSeed(), alts);
        s_placer = new Vh.World.Locations.LocationPlacer(wg, biomes, rules);
        return version;
    }

    /// <summary>The biome variants, after LocationsStart: the sectors that carry one
    /// (seedgen's oracle.altbiomes.json, what /api/worlds/{seed}/altbiomes serves).</summary>
    [JSExport]
    public static string AltBiomesJson() => Vh.World.Locations.AltBiomeExport.Json(s_biomes!);

    /// <summary>Which of those sectors each minimap cell is in (oracle.altbiomes.u8, before gzip).</summary>
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<byte> AltBiomeGrid() => Vh.World.Locations.AltBiomeExport.Grid(s_biomes!);

    /// <summary>Place for up to <paramref name="budgetMs"/>; returns progress 0-1 (1 when done).</summary>
    [JSExport]
    public static double LocationsRun(int budgetMs) =>
        s_placer!.Run(TimeSpan.FromMilliseconds(budgetMs)) ? 1.0 : s_placer.Progress;

    /// <summary>The location type being placed now (for a progress label), or "".</summary>
    [JSExport]
    public static string LocationsCurrent() => s_placer?.Current?.Prefab ?? "";

    /// <summary>The placed locations: [[prefab, x, z], ...] in placement order.</summary>
    [JSExport]
    public static string LocationsJson()
    {
        var sb = new System.Text.StringBuilder("[");
        foreach (var p in s_placer!.Placed)
        {
            if (sb.Length > 1) sb.Append(',');
            sb.Append("[\"").Append(p.Rule.Prefab).Append("\",")
              .Append(p.X.ToString("R", System.Globalization.CultureInfo.InvariantCulture)).Append(',')
              .Append(p.Z.ToString("R", System.Globalization.CultureInfo.InvariantCulture)).Append(']');
        }
        return sb.Append(']').ToString();
    }

    // ── Contents, after the locations: each POI as seedgen serves it ──────────
    // ContentsStart, then ContentsRun repeatedly (progress), then PoisJson.

    static List<PoiLocation>? s_pois;
    static int s_contentsDone;

    [JSExport]
    public static void ContentsStart()
    {
        s_pois = new List<PoiLocation>();
        s_contentsDone = 0;
    }

    /// <summary>Work out the contents of placed locations for up to <paramref name="budgetMs"/>;
    /// returns progress 0-1 (1 when every location is done).</summary>
    [JSExport]
    public static double ContentsRun(int budgetMs)
    {
        var placed = s_placer!.Placed;
        var wg = s_last!.Value.Wg;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (s_contentsDone < placed.Count && sw.ElapsedMilliseconds < budgetMs)
            LocationFinder.AddPlaced(s_pois!, placed[s_contentsDone++], wg.GetSeed(), wg);
        return placed.Count == 0 ? 1.0 : (double)s_contentsDone / placed.Count;
    }

    /// <summary>Diagnostics: contents time per prefab over all placed locations, slowest first.</summary>
    [JSExport]
    public static string ContentsProfile()
    {
        var wg = s_last!.Value.Wg;
        var per = new Dictionary<string, (double Ms, int N)>();
        var tmp = new List<PoiLocation>();
        foreach (var p in s_placer!.Placed)
        {
            var t = System.Diagnostics.Stopwatch.GetTimestamp();
            LocationFinder.AddPlaced(tmp, p, wg.GetSeed(), wg);
            var ms = System.Diagnostics.Stopwatch.GetElapsedTime(t).TotalMilliseconds;
            var e = per.GetValueOrDefault(p.Rule.Prefab);
            per[p.Rule.Prefab] = (e.Ms + ms, e.N + 1);
        }
        return string.Join('\n', per.OrderByDescending(x => x.Value.Ms).Take(15)
            .Select(x => $"{x.Key,-34} {x.Value.N,5} x {x.Value.Ms,8:0} ms ({x.Value.Ms / x.Value.N:0.00} each)"));
    }

    /// <summary>The POIs, in the shape of seedgen's `pois` file (what the map and POI card read).</summary>
    [JSExport]
    public static string PoisJson() => System.Text.Json.JsonSerializer.Serialize(s_pois!, PoiJson.Default.ListPoiLocation);

    // Building a generator (lakes, rivers, streams) is the slow part: keep the last one.
    static (int Seed, int Version, WorldGenerator Wg)? s_last;
    static WorldGenerator Generator(int seed, int version)
    {
        if (s_last is { } l && l.Seed == seed && l.Version == version) return l.Wg;
        var wg = new WorldGenerator(seed, version);
        s_last = (seed, version, wg);
        return wg;
    }

    /// <summary>Mathf.PerlinNoise as we reproduce it, for checking against the game's fixture.</summary>
    [JSExport]
    public static float Perlin(float x, float y) => PerlinNoise.Noise(x, y);
}
