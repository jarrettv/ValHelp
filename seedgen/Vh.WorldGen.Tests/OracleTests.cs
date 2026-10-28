using System.Text;
using Vh.Numerics;
using Vh.World;
using Xunit;

namespace Vh.WorldGen.Tests;

/// <summary>
/// Our terrain against the game's, bit for bit, for every seed in oracle-fixtures/.
/// Ordered as in scripts/compare_oracle.py: Perlin first (everything is built on
/// it), then the biome (breaks only where noise crosses a threshold), then
/// height and forest (continuous, so any upstream error shows everywhere).
/// </summary>
public class OracleTests
{
    const string NoFixtures = "(no fixtures)";

    public static TheoryData<string> Fixtures()
    {
        var data = new TheoryData<string>();
        var all = OracleFixture.All();
        if (all.Count == 0) data.Add(NoFixtures);   // fail, don't pass vacuously
        foreach (var f in all) data.Add(f.Name);
        return data;
    }

    static OracleFixture Get(string name)
    {
        Assert.True(name != NoFixtures,
            $"No oracle fixtures under {OracleFixture.Root}. Make some with scripts/oracle_fixtures.sh <seed>...");
        return OracleFixture.All().Single(f => f.Name == name);
    }

    [Theory, MemberData(nameof(Fixtures))]
    public void Perlin_matches_game(string fixture)
    {
        var t = Get(fixture).Perlin;
        var diff = new Diff("perlin");
        for (int k = 0; k < t.Length / 3; k++)
            diff.Float(k, t[k * 3 + 2], PerlinNoise.Noise(t[k * 3], t[k * 3 + 1]),
                () => $"PerlinNoise({t[k * 3]:R}, {t[k * 3 + 1]:R})");
        diff.AssertNone();
    }

    [Theory, MemberData(nameof(Fixtures))]
    public void Grid_matches_game(string fixture)
    {
        var f = Get(fixture);
        var ours = f.Grid;

        var biome = new Diff("biome");
        var want = f.Biome;
        for (int k = 0; k < want.Length; k++)
            if (want[k] != ours.Biome[k]) biome.Count(k, $"game {want[k]}, ours {ours.Biome[k]}");

        var height = new Diff("height");
        var wantH = f.Height;
        for (int k = 0; k < wantH.Length; k++) height.Float(k, wantH[k], ours.Height[k]);

        var forest = new Diff("forest");
        var wantF = f.Forest;
        for (int k = 0; k < wantF.Length; k++) forest.Float(k, wantF[k], ours.Forest[k]);

        Diff.AssertNone(f.ToString(), biome, height, forest);
    }

    /// <summary>
    /// The river network heights are carved from, stage by stage in the order the
    /// game builds it: lakes, then rivers between them, streams, and the river
    /// points rendered per grid cell. An early stage that differs makes every
    /// later one differ too, so start from the first.
    /// </summary>
    [Theory, MemberData(nameof(Fixtures))]
    public void Rivers_match_game(string fixture)
    {
        var f = Get(fixture);
        var game = f.Rivers;
        Assert.True(game != null, $"{f.Name} has no oracle.rivers.bin.gz; re-run scripts/oracle_fixtures.sh {f.Name}");
        var wg = new WorldGenerator(f.Seed, f.WorldGenVersion);

        static bool Same(float a, float b) => BitConverter.SingleToInt32Bits(a) == BitConverter.SingleToInt32Bits(b);
        static float[] Flat(WorldGenerator.River r) =>
            [r.p0.x, r.p0.y, r.p1.x, r.p1.y, r.center.x, r.center.y, r.widthMin, r.widthMax, r.curveWidth, r.curveWavelength];

        var lakes = new Diff("lakes");
        var ourLakes = wg.GetLakes();
        if (ourLakes.Count != game!.Lakes.Length) lakes.Count(-1, $"game {game.Lakes.Length} lakes, ours {ourLakes.Count}", () => "count");
        for (int i = 0; i < Math.Min(ourLakes.Count, game.Lakes.Length); i++)
            if (!Same(ourLakes[i].x, game.Lakes[i].X) || !Same(ourLakes[i].y, game.Lakes[i].Y))
                lakes.Count(i, $"game ({game.Lakes[i].X:R},{game.Lakes[i].Y:R}), ours ({ourLakes[i].x:R},{ourLakes[i].y:R})", () => $"lake {i}");

        Diff Rivers(string name, IReadOnlyList<WorldGenerator.River> ours, float[][] want)
        {
            var d = new Diff(name);
            if (ours.Count != want.Length) d.Count(-1, $"game {want.Length}, ours {ours.Count}", () => "count");
            for (int i = 0; i < Math.Min(ours.Count, want.Length); i++)
            {
                var o = Flat(ours[i]);
                int k = Enumerable.Range(0, 10).FirstOrDefault(k => !Same(o[k], want[i][k]), -1);
                if (k >= 0)
                    d.Count(i, $"field {k}: game {want[i][k]:R}, ours {o[k]:R} (p0 game ({want[i][0]},{want[i][1]}))", () => $"{name} {i}");
            }
            return d;
        }
        var rivers = Rivers("rivers", wg.GetRivers(), game.Rivers);
        var streams = Rivers("streams", wg.GetStreams(), game.Streams);

        var points = new Diff("river points");
        var ourPoints = wg.GetRiverPoints();
        if (ourPoints.Count != game.Grids.Length) points.Count(-1, $"game {game.Grids.Length} grid cells, ours {ourPoints.Count}", () => "count");
        foreach (var (cell, want) in game.Grids)
        {
            if (!ourPoints.TryGetValue(new Vh.Numerics.Vector2i(cell.X, cell.Y), out var got))
            {
                points.Count(-1, $"missing in ours ({want.Length} points)", () => $"cell {cell}");
                continue;
            }
            int bad = -1;
            for (int k = 0; k < Math.Min(got.Length, want.Length) && bad < 0; k++)
                if (!Same(got[k].p.x, want[k].X) || !Same(got[k].p.y, want[k].Y) || !Same(got[k].w, want[k].W)) bad = k;
            if (got.Length != want.Length || bad >= 0)
                points.Count(-1, got.Length != want.Length
                    ? $"game {want.Length} points, ours {got.Length}"
                    : $"point {bad}: game ({want[bad].X:R},{want[bad].Y:R} w {want[bad].W:R}), ours ({got[bad].p.x:R},{got[bad].p.y:R} w {got[bad].w:R})",
                    () => $"cell {cell}");
        }

        Diff.AssertNone(f.ToString(), lakes, rivers, streams, points);
    }

    /// <summary>Mismatch tally for one quantity, with a few examples to start from.</summary>
    sealed class Diff(string name)
    {
        int _count, _maxUlp;
        readonly List<string> _examples = [];

        public void Float(int k, float want, float got, Func<string>? what = null)
        {
            int a = BitConverter.SingleToInt32Bits(want), b = BitConverter.SingleToInt32Bits(got);
            if (a == b) return;
            int ulp = Ulps(a, b);
            _maxUlp = Math.Max(_maxUlp, ulp);
            Count(k, $"game {want:R}, ours {got:R} ({ulp} ulp)", what);
        }

        public void Count(int k, string detail, Func<string>? what = null)
        {
            if (_count++ < 5) _examples.Add($"    {what?.Invoke() ?? Cell(k)}: {detail}");
        }

        public bool Ok => _count == 0;

        public string Report() => Ok
            ? $"  {name}: exact"
            : $"  {name}: {_count:N0} differ" + (_maxUlp > 0 ? $", worst {_maxUlp} ulp" : "") +
              "\n" + string.Join("\n", _examples);

        public void AssertNone() => AssertNone(name, this);

        public static void AssertNone(string title, params Diff[] diffs)
        {
            if (diffs.All(d => d.Ok)) return;
            var sb = new StringBuilder($"{title} differs from the game:\n");
            foreach (var d in diffs) sb.AppendLine(d.Report());
            Assert.Fail(sb.ToString());
        }

        /// <summary>Grid cell -> its row/column and world position.</summary>
        static string Cell(int k)
        {
            int i = k / WorldGrid.Size, j = k % WorldGrid.Size;
            float wx = (j - WorldGrid.Size / 2) * WorldGrid.PixelSize + WorldGrid.PixelSize / 2;
            float wz = (i - WorldGrid.Size / 2) * WorldGrid.PixelSize + WorldGrid.PixelSize / 2;
            return $"cell ({i},{j}) world ({wx},{wz})";
        }

        /// <summary>Distance in representable float32 steps (0 = identical).</summary>
        static int Ulps(int a, int b)
        {
            if (a < 0) a = int.MinValue - a;
            if (b < 0) b = int.MinValue - b;
            long d = Math.Abs((long)a - b);
            return d > int.MaxValue ? int.MaxValue : (int)d;
        }
    }
}
