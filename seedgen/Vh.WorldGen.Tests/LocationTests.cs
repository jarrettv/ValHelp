using System.Text.Json;
using Vh.World;
using Vh.World.Locations;
using Xunit;

namespace Vh.WorldGen.Tests;

/// <summary>
/// Location placement against the game, for every fixture with an
/// oracle.locations.json (scripts/oracle_fixtures.sh): the biome sectors, the
/// alt biomes on them, and every placed location, bit for bit.
/// </summary>
public class LocationTests
{
    public static TheoryData<string> Fixtures() => OracleTests.Fixtures();

    sealed record Setup(OracleFixture Fixture, List<LocationRule> Rules, List<AltBiomeRule> Alts, BiomeData Biomes,
        Dictionary<int, string[]> GameAlts);

    static Setup Load(string name)
    {
        Assert.True(name != "(no fixtures)", $"No oracle fixtures under {OracleFixture.Root}. Make some with scripts/oracle_fixtures.sh <seed>...");
        var f = OracleFixture.All().Single(x => x.Name == name);
        var path = Path.Combine(f.Dir, "oracle.locations.json");
        Assert.True(File.Exists(path), $"{f.Name} has no oracle.locations.json; re-run scripts/oracle_fixtures.sh {f.Name}");
        var (rules, alts) = LocationRule.Load(File.ReadAllText(path));
        var grid = f.Grid;
        var biomes = BiomeData.Build(grid, f.Seed, alts);
        using var ab = JsonDocument.Parse(File.ReadAllText(Path.Combine(f.Dir, "oracle.altbiomes.json")));
        var gameAlts = ab.RootElement.EnumerateArray().ToDictionary(e => e.GetProperty("index").GetInt32(),
            e => e.GetProperty("alts").EnumerateArray().Select(x => x.GetString()!).ToArray());
        return new Setup(f, rules, alts, biomes, gameAlts);
    }

    [Theory, MemberData(nameof(Fixtures))]
    public void Sectors_match_game(string fixture)
    {
        var s = Load(fixture);
        using var ab = JsonDocument.Parse(File.ReadAllText(Path.Combine(s.Fixture.Dir, "oracle.altbiomes.json")));
        var bad = new List<string>();
        foreach (var e in ab.RootElement.EnumerateArray())
        {
            int idx = e.GetProperty("index").GetInt32();
            var sec = idx < s.Biomes.Sectors.Count ? s.Biomes.Sectors[idx] : null;
            if (sec == null || sec.Biome.ToString() != e.GetProperty("biome").GetString() || sec.EdgeCount != e.GetProperty("edge").GetInt32() ||
                sec.Center.x != e.GetProperty("cx").GetSingle() || sec.Center.y != e.GetProperty("cy").GetSingle())
                bad.Add($"sector {idx}: game {e}, ours {sec?.Biome} edge {sec?.EdgeCount} centre ({sec?.Center.x:R}, {sec?.Center.y:R})");
        }
        Assert.True(bad.Count == 0, $"{s.Fixture}: {bad.Count} sectors differ:\n  " + string.Join("\n  ", bad.Take(5)));
    }

    /// <summary>The alt biomes the game gave each sector.</summary>
    [Theory, MemberData(nameof(Fixtures))]
    public void AltBiomes_match_game(string fixture)
    {
        var s = Load(fixture);
        var ours = s.Biomes.Sectors.Where(x => x.AltBiomes.Count > 0).ToDictionary(x => x.Index, x => x.AltBiomes.Select(a => a.Name).ToArray());
        var diff = s.GameAlts.Keys.Union(ours.Keys).Order()
            .Where(k => !(s.GameAlts.GetValueOrDefault(k) ?? []).SequenceEqual(ours.GetValueOrDefault(k) ?? []))
            .Select(k => $"sector {k}: game [{string.Join(", ", s.GameAlts.GetValueOrDefault(k) ?? [])}], ours [{string.Join(", ", ours.GetValueOrDefault(k) ?? [])}]")
            .ToList();
        Assert.True(diff.Count == 0, $"{s.Fixture}: alt biomes differ on {diff.Count} sectors:\n  " +
            string.Join("\n  ", diff.Take(5)));
    }

    /// <summary>What the web map's variant overlay reads (AltBiomeExport), against the game's own
    /// oracle.altbiomes.json and .u8.gz: same sectors and variants, and the sector grid byte for byte.</summary>
    [Theory, MemberData(nameof(Fixtures))]
    public void AltBiomeExport_matches_oracle(string fixture)
    {
        var s = Load(fixture);
        static string Canon(JsonElement e) => string.Join('\n', e.EnumerateArray().Select(x =>
            $"{x.GetProperty("index").GetInt32()} {x.GetProperty("biome").GetString()} {x.GetProperty("edge").GetInt32()} " +
            $"{x.GetProperty("cx").GetSingle():R} {x.GetProperty("cy").GetSingle():R} " +
            $"{string.Join(",", x.GetProperty("min").EnumerateArray().Select(v => v.GetSingle().ToString("R")))} " +
            $"{string.Join(",", x.GetProperty("max").EnumerateArray().Select(v => v.GetSingle().ToString("R")))} " +
            string.Join(",", x.GetProperty("alts").EnumerateArray().Select(v => v.GetString()))));
        using var game = JsonDocument.Parse(File.ReadAllText(Path.Combine(s.Fixture.Dir, "oracle.altbiomes.json")));
        using var ours = JsonDocument.Parse(AltBiomeExport.Json(s.Biomes));
        Assert.Equal(Canon(game.RootElement), Canon(ours.RootElement));

        using var gz = new System.IO.Compression.GZipStream(File.OpenRead(Path.Combine(s.Fixture.Dir, "oracle.altbiomes.u8.gz")),
            System.IO.Compression.CompressionMode.Decompress);
        using var ms = new MemoryStream();
        gz.CopyTo(ms);
        var gameGrid = ms.ToArray();
        var grid = AltBiomeExport.Grid(s.Biomes);
        int diff = 0;
        for (int i = 0; i < grid.Length; i++) if (grid[i] != gameGrid[i]) diff++;
        Assert.True(gameGrid.Length == grid.Length && diff == 0, $"{s.Fixture}: sector grid differs in {diff} cells");
    }

    /// <summary>Placement itself, given the game's alt biomes, so an alt-biome difference can't hide a placement bug.</summary>
    [Theory, MemberData(nameof(Fixtures))]
    public void Locations_match_game(string fixture)
    {
        var s = Load(fixture);
        foreach (var sec in s.Biomes.Sectors) sec.AltBiomes.Clear();
        var byName = s.Alts.ToDictionary(a => a.Name);
        foreach (var (idx, names) in s.GameAlts)
            foreach (var n in names) s.Biomes.Sectors[idx].AltBiomes.Add(byName[n]);

        var placed = new LocationPlacer(new WorldGenerator(s.Fixture.Seed, s.Fixture.WorldGenVersion), s.Biomes, s.Rules).RunToEnd();

        static int B(float f) => BitConverter.SingleToInt32Bits(f);
        using var ld = JsonDocument.Parse(File.ReadAllText(Path.Combine(s.Fixture.Dir, "oracle.locations.json")));
        var game = ld.RootElement.GetProperty("instances").EnumerateArray()
            .Select(e => (P: e[0].GetString()!, X: e[1].GetInt32(), Y: e[2].GetInt32(), Z: e[3].GetInt32())).ToHashSet();
        var ours = placed.Select(p => (P: p.Rule.Prefab, X: B(p.X), Y: B(p.Y), Z: B(p.Z))).ToHashSet();
        if (game.SetEquals(ours)) return;

        // Report by type, in placement order: the first type that differs is where to look.
        var order = s.Rules.OrderByDescending(r => r.Prioritized).Where(r => r.Enable && r.Quantity != 0).Select(r => r.Prefab).Distinct();
        var lines = new List<string>();
        foreach (var pf in order)
        {
            var g = game.Where(i => i.P == pf).ToHashSet();
            var o = ours.Where(i => i.P == pf).ToHashSet();
            if (g.SetEquals(o)) continue;
            lines.Add($"{pf}: game {g.Count}, ours {o.Count}, {g.Intersect(o).Count()} identical");
        }
        Assert.Fail($"{s.Fixture}: {game.Count} placed by the game, {ours.Count} by us, {game.Intersect(ours).Count()} identical. " +
            $"{lines.Count} types differ, in placement order:\n  " + string.Join("\n  ", lines.Take(8)));
    }
}
