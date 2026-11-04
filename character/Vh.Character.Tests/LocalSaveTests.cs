using Xunit;
using Xunit.Abstractions;

namespace Vh.Character.Tests;

public class LocalSaveTests(ITestOutputHelper output)
{
    private static readonly string SaveRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow", "IronGate", "Valheim");

    private static IEnumerable<string> Files(string pattern, params string[] dirs) =>
        dirs.Select(d => Path.Combine(SaveRoot, d)).Where(Directory.Exists)
            .SelectMany(d => Directory.EnumerateFiles(d, pattern, SearchOption.AllDirectories));

    private static IEnumerable<string> CharacterFiles() =>
        Files("*.fch", "characters_local", "characters").Concat(Files("*.fch.old", "characters_local", "characters"));

    [Fact]
    public void EveryCharacterParsesCompletelyWithValidHash()
    {
        var failures = new List<string>();
        int count = 0;
        foreach (var path in CharacterFiles())
        {
            count++;
            try
            {
                var p = CharacterFile.Read(path);
                if (!p.HashValid) failures.Add($"{path}: hash mismatch");
                var maps = p.Worlds.Where(w => w.Map != null).ToList();
                output.WriteLine($"{Path.GetFileName(path)}: v{p.Version} pd{p.Player?.Version} inv{p.Player?.Inventory.Version} " +
                    $"'{p.Name}' worlds={p.Worlds.Count} maps={maps.Count} " +
                    $"mapv={string.Join(",", maps.Select(w => w.Map!.Version).Distinct())} " +
                    $"size={string.Join(",", maps.Select(w => w.Map!.Size).Distinct())} " +
                    $"pins={maps.Sum(w => w.Map!.Pins.Count)} items={p.Player?.Inventory.Items.Count} skills={p.Player?.Skills.Count}");
            }
            catch (Exception e)
            {
                failures.Add($"{path}: {e.GetType().Name}: {e.Message}");
            }
        }
        output.WriteLine($"{count} files, {failures.Count} failures");
        Assert.True(failures.Count == 0, string.Join("\n", failures));
    }

    /// <summary>
    /// The game explores around the player as they move, so the cell under a
    /// logout point is explored. Confirms grid orientation and the 12 m cell size.
    /// </summary>
    [Fact]
    public void LogoutPointsAreOnExploredCells()
    {
        int checkedPoints = 0, hits = 0;
        var misses = new List<string>();
        foreach (var path in CharacterFiles())
        {
            CharacterProfile p;
            try { p = CharacterFile.Read(path); } catch { continue; }
            foreach (var w in p.Worlds)
            {
                if (w.Map is not { } m || w.Logout is not { } pos || m.ExploredCount == 0) continue;
                checkedPoints++;
                var (x, y) = m.CellOf(pos.X, pos.Z);
                if (x >= 0 && y >= 0 && x < m.Size && y < m.Size && m.IsExplored(x, y)) hits++;
                else misses.Add($"{Path.GetFileName(path)} world {w.WorldUid} logout ({pos.X:F0},{pos.Z:F0}) cell ({x},{y})");
            }
        }
        output.WriteLine($"{hits}/{checkedPoints} logout points on explored cells");
        foreach (var miss in misses) output.WriteLine("miss: " + miss);
        Assert.True(checkedPoints == 0 || hits >= checkedPoints * 0.95, $"{hits}/{checkedPoints}");
    }

    [Fact]
    public void EveryWorldMetaParses()
    {
        var failures = new List<string>();
        var paths = Files("*.fwl", "worlds_local", "worlds").Concat(Files("_main.*.fwl2", "worlds_local", "worlds"));
        foreach (var path in paths)
        {
            try
            {
                var w = WorldFile.Read(path);
                output.WriteLine($"{Path.GetFileName(path)}: v{w.Version} name='{w.Name}' seed='{w.SeedName}' uid={w.Uid}");
                if (WorldFile.StableHash(w.SeedName) != w.Seed) failures.Add($"{path}: seed hash mismatch");
            }
            catch (Exception e)
            {
                failures.Add($"{path}: {e.GetType().Name}: {e.Message}");
            }
        }
        Assert.True(failures.Count == 0, string.Join("\n", failures));
    }
}
