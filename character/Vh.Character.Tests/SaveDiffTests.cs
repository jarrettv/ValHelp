using Xunit;
using Xunit.Abstractions;

namespace Vh.Character.Tests;

public class SaveDiffTests(ITestOutputHelper output)
{
    static readonly DateTime T0 = new(2026, 11, 3, 18, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void FirstSaveStartsSessionOneAtItsPlayClock()
    {
        var t = SaveDiff.Place(T0, 600, null, 0, 0, 0);
        Assert.Equal(new SaveDiff.Timing(1, 600, false), t);
    }

    [Fact]
    public void SavesWithinAnHourShareASession()
    {
        var t = SaveDiff.Place(T0.AddMinutes(59), 900, T0, 3, 600, 1000);
        Assert.Equal(new SaveDiff.Timing(3, 1300, false), t);
    }

    [Fact]
    public void GapOverAnHourStartsANewSession()
    {
        var t = SaveDiff.Place(T0.AddMinutes(61), 900, T0, 3, 600, 1000);
        Assert.Equal(new SaveDiff.Timing(4, 1300, false), t);
    }

    [Fact]
    public void RestoredBackupIsARewindAndTheAxisHolds()
    {
        var t = SaveDiff.Place(T0.AddMinutes(5), 300, T0, 2, 600, 1000);
        Assert.Equal(new SaveDiff.Timing(2, 1000, true), t);
    }

    [Fact]
    public void FirstSaveTilesCoverTheWholeFog()
    {
        var p = CharacterFile.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "tracktest-v47.fch")));
        var map = p.Worlds[0].Map!;
        var tiles = SaveDiff.ChangedTiles(null, map);
        Assert.NotEmpty(tiles);
        Assert.Equal(map.ExploredCount, tiles.Sum(t => t.Explored.Sum(b => System.Numerics.BitOperations.PopCount(b))));
        var rebuilt = Apply(new byte[map.Explored.Length], map.Size, tiles.Select(t => (t.Index, t.Explored)));
        Assert.Equal(map.Explored, rebuilt);
    }

    /// <summary>
    /// Every character's saves in file-time order (backups, .old, current):
    /// applying each save's changed tiles to the fog rebuilt so far must give
    /// exactly that save's fog, including when a restore shrinks it.
    /// </summary>
    [Fact]
    public void TileDiffsRebuildEverySaveOfEveryLocalCharacter()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow", "IronGate", "Valheim", "characters_local");
        if (!Directory.Exists(dir)) return;
        var saves = Directory.EnumerateFiles(dir).Where(f => f.EndsWith(".fch") || f.EndsWith(".fch.old"))
            .Select(f => { try { return (Time: File.GetLastWriteTimeUtc(f), Profile: CharacterFile.Read(f)); } catch { return default; } })
            .Where(s => s.Profile != null)
            .GroupBy(s => s.Profile.PlayerId);
        int steps = 0, tilesTotal = 0;
        foreach (var character in saves)
        {
            var fog = new Dictionary<long, byte[]>();
            CharacterProfile? prev = null;
            foreach (var (time, p) in character.OrderBy(s => s.Time))
            {
                foreach (var w in p.Worlds.Where(w => w.Map != null))
                {
                    var old = prev?.Worlds.FirstOrDefault(o => o.WorldUid == w.WorldUid)?.Map;
                    var tiles = SaveDiff.ChangedTiles(old, w.Map!);
                    tilesTotal += tiles.Count;
                    var bits = fog.TryGetValue(w.WorldUid, out var b) ? b : new byte[w.Map!.Explored.Length];
                    fog[w.WorldUid] = Apply(bits, w.Map!.Size, tiles.Select(t => (t.Index, t.Explored)));
                    Assert.Equal(w.Map!.Explored, fog[w.WorldUid]);
                    steps++;
                }
                prev = p;
            }
        }
        output.WriteLine($"{steps} world saves rebuilt from {tilesTotal} tiles");
    }

    /// <summary>fastash restored an older backup on 2026-08-23: the play clock went back.</summary>
    [Fact]
    public void FastashRestoreShowsAsRewind()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow", "IronGate", "Valheim", "characters_local");
        var files = Directory.Exists(dir) ? Directory.GetFiles(dir, "fastash*.fch") : [];
        if (files.Length < 3) return;
        DateTime? prevTime = null;
        int session = 0, rewinds = 0;
        float prevPlay = 0, axis = 0;
        foreach (var f in files.OrderBy(File.GetLastWriteTimeUtc))
        {
            var time = File.GetLastWriteTimeUtc(f);
            var play = SaveDiff.PlaySeconds(CharacterFile.Read(f));
            var t = SaveDiff.Place(time, play, prevTime, session, prevPlay, axis);
            Assert.True(t.AxisSeconds >= axis);
            if (t.Rewind) rewinds++;
            output.WriteLine($"{time:MM-dd HH:mm} play={play / 3600:F2}h axis={t.AxisSeconds / 3600:F2}h session={t.Session}{(t.Rewind ? " REWIND" : "")} {Path.GetFileName(f)}");
            (prevTime, session, prevPlay, axis) = (time, t.Session, play, t.AxisSeconds);
        }
        Assert.True(rewinds > 0);
    }

    static byte[] Apply(byte[] bits, int size, IEnumerable<(short Index, byte[] Tile)> tiles)
    {
        var result = (byte[])bits.Clone();
        int perSide = size / SaveDiff.TileCells;
        foreach (var (index, tile) in tiles)
        {
            int tx = index % perSide, ty = index / perSide;
            for (int row = 0; row < SaveDiff.TileCells; row++)
                Buffer.BlockCopy(tile, row * 8, result, ((ty * SaveDiff.TileCells + row) * size + tx * SaveDiff.TileCells) / 8, 8);
        }
        return result;
    }
}
