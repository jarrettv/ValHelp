using System.IO.Compression;
using System.Text.Json;

namespace Vh.WorldGen.Tests;

/// <summary>
/// One seed's ground truth from the game: the oracle plugin's dumps
/// (seedgen/oracle/README.md), collected by scripts/oracle_fixtures.sh into
/// <c>oracle-fixtures/&lt;seed&gt;/</c> next to this project, or under
/// <c>VALHELP_ORACLE_FIXTURES</c>.
/// </summary>
public sealed record OracleFixture(string Name, string Dir, int Seed, int WorldGenVersion, string GameVersion)
{
    public static string Root =>
        Environment.GetEnvironmentVariable("VALHELP_ORACLE_FIXTURES") is { Length: > 0 } env
            ? env
            : Path.GetFullPath(Path.Combine(ProjectDir(), "oracle-fixtures"));

    /// <summary>Every fixture directory with a complete dump.</summary>
    public static IReadOnlyList<OracleFixture> All()
    {
        if (!Directory.Exists(Root)) return [];
        return Directory.GetDirectories(Root)
            .Where(d => File.Exists(Path.Combine(d, "oracle.json")) && File.Exists(Path.Combine(d, "oracle.height.f32.gz")))
            .Order(StringComparer.Ordinal)
            .Select(Load)
            .ToList();
    }

    static OracleFixture Load(string dir)
    {
        using var meta = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "oracle.json")));
        var r = meta.RootElement;
        return new OracleFixture(Path.GetFileName(dir), dir,
            r.GetProperty("seed").GetInt32(),
            r.TryGetProperty("worldGenVersion", out var v) ? v.GetInt32() : 2,
            r.TryGetProperty("gameVersion", out var g) ? g.GetString() ?? "?" : "?");
    }

    /// <summary>Our grid for this seed, made once per test run (tests share it read-only).</summary>
    public Vh.World.WorldGrid Grid => s_grids.GetOrAdd(Name, _ => new Lazy<Vh.World.WorldGrid>(
        () => Vh.World.WorldGrid.GenerateParallel(Seed, WorldGenVersion))).Value;
    static readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<Vh.World.WorldGrid>> s_grids = new();

    public float[] Height => Floats("oracle.height.f32.gz");
    public float[] Forest => Floats("oracle.forest.f32.gz");
    public byte[] Biome => Bytes("oracle.biome.u8.gz");
    /// <summary>(x, y, Mathf.PerlinNoise(x, y)) triples.</summary>
    public float[] Perlin => Floats("oracle.perlin.f32.gz");

    /// <summary>The game's river network (OraclePlugin.WriteRivers); null in fixtures made before it was dumped.</summary>
    public RiverDump? Rivers => File.Exists(Path.Combine(Dir, "oracle.rivers.bin.gz"))
        ? RiverDump.Read(Bytes("oracle.rivers.bin.gz")) : null;

    byte[] Bytes(string file)
    {
        using var gz = new GZipStream(File.OpenRead(Path.Combine(Dir, file)), CompressionMode.Decompress);
        using var ms = new MemoryStream();
        gz.CopyTo(ms);
        return ms.ToArray();
    }

    float[] Floats(string file)
    {
        var b = Bytes(file);
        var f = new float[b.Length / 4];
        Buffer.BlockCopy(b, 0, f, 0, f.Length * 4);   // little-endian, as the plugin writes
        return f;
    }

    public override string ToString() => $"{Name} (seed {Seed}, worldGen {WorldGenVersion}, game {GameVersion})";

    /// <summary>The test project's source directory (fixtures live there, not in bin/).</summary>
    static string ProjectDir()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
            if (File.Exists(Path.Combine(d.FullName, "Vh.WorldGen.Tests.csproj"))) return d.FullName;
        return AppContext.BaseDirectory;
    }
}
