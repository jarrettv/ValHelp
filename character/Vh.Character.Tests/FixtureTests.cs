using Xunit;

namespace Vh.Character.Tests;

/// <summary>
/// 1.0.21 saves from a throwaway character ("Tracktest", ~4 min in a local
/// world "tracktest"), so the newest format is covered without local saves.
/// </summary>
public class FixtureTests
{
    private static byte[] Fixture(string name) =>
        File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", name));

    [Fact]
    public void Profile47()
    {
        var p = CharacterFile.Parse(Fixture("tracktest-v47.fch"));
        Assert.True(p.HashValid);
        Assert.Equal(47, p.Version);
        Assert.Equal("Tracktest", p.Name);
        Assert.Equal(10, p.Stats.Count);
        Assert.Equal(205, p.Stats[0].Values.Length);
        Assert.Equal(8, p.Stats[0].Values[Array.IndexOf(GameNames.PlayerStats, "Jumps")]);

        var w = Assert.Single(p.Worlds);
        Assert.Equal(4078885593, w.WorldUid);
        Assert.NotNull(w.Logout);
        var m = w.Map!;
        Assert.Equal(2048, m.Size);
        Assert.Equal(532, m.ExploredCount);
        var (x, y) = m.CellOf(w.Logout.Value.X, w.Logout.Value.Z);
        Assert.True(m.IsExplored(x, y));

        var d = p.Player!;
        Assert.Equal(34, d.Version);
        Assert.Equal(110, d.Inventory.Version);
        Assert.Equal(25, d.MaxHealth);
        var chest = Assert.Single(d.Inventory.Items, i => i.PrefabHash == WorldFile.StableHash("ArmorRagsChest"));
        Assert.True(chest.Equipped);
        Assert.Equal(16, Assert.Single(d.Inventory.Items, i => i.PrefabHash == WorldFile.StableHash("Wood")).Stack);
        Assert.Contains(d.Skills, s => s.Name == "Run" && s.Level == 2);
    }

    [Fact]
    public void ChunkedWorldMeta()
    {
        var w = WorldFile.Parse(Fixture("tracktest-v42.fwl2"));
        Assert.Equal(42, w.Version);
        Assert.Equal("tracktest", w.Name);
        Assert.Equal("tracktest", w.SeedName);
        Assert.Equal(4078885593, w.Uid);
        Assert.Equal(WorldFile.StableHash(w.SeedName), w.Seed);
    }

    [Fact]
    public void MinimapMetaHoldsSeedHash()
    {
        var (seed, version) = WorldFile.ParseMinimapMeta(Fixture("tracktest.cacheMinimapMeta"));
        Assert.Equal(WorldFile.StableHash("tracktest"), seed);
        Assert.Equal(1, version);
    }
}
