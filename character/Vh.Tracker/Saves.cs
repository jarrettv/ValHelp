using Microsoft.Win32;

namespace Vh.Tracker;

/// <summary>A character found on disk: its main .fch and the folder it lives in.</summary>
public record CharacterSave(string Key, string Name, string Where, string Dir)
{
    public string Display => Where.Length == 0 ? Name : $"{Name} ({Where})";
}

/// <summary>One save of a character (current, .old or a backup) and when the game wrote it.</summary>
public record SaveFile(string Path, DateTime Time);

/// <summary>A small world file sent along with uploads so the site can tie worlds to seeds.</summary>
public record HintFile(string Field, string Name, byte[] Bytes);

/// <summary>
/// Where Valheim keeps saves on Windows:
///   %USERPROFILE%\AppData\LocalLow\IronGate\Valheim\characters_local, worlds_local   (local saves)
///   ...\Valheim\characters, worlds                                                   (pre-cloud local saves)
///   &lt;Steam&gt;\userdata\&lt;id&gt;\892970\remote\characters, worlds                         (Steam cloud saves)
/// The game writes "&lt;name&gt;.fch.new" and renames it over "&lt;name&gt;.fch" (keeping the
/// previous one as ".fch.old"), and adds "&lt;name&gt;_backup_auto-*.fch" /
/// "_backup_restore-*.fch" copies.
/// </summary>
public static class Saves
{
    const string SteamAppId = "892970";
    const int MaxHintBytes = 64 << 10;
    /// <summary>A world save this close to a character save is taken as written with it.</summary>
    static readonly TimeSpan SameSave = TimeSpan.FromMinutes(15);

    static string ValheimDir => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow", "IronGate", "Valheim");

    static IEnumerable<string> SteamRemoteDirs()
    {
        var steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string;
        if (string.IsNullOrEmpty(steam))
            steam = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam");
        var userdata = System.IO.Path.Combine(steam.Replace('/', '\\'), "userdata");
        if (!Directory.Exists(userdata)) yield break;
        foreach (var user in Directory.EnumerateDirectories(userdata))
        {
            var remote = System.IO.Path.Combine(user, SteamAppId, "remote");
            if (Directory.Exists(remote)) yield return remote;
        }
    }

    /// <summary>Character folders that exist, with a label for the menu.</summary>
    public static List<(string Dir, string Where)> CharacterDirs()
    {
        var dirs = new List<(string, string)>
        {
            (System.IO.Path.Combine(ValheimDir, "characters_local"), ""),
            (System.IO.Path.Combine(ValheimDir, "characters"), "old local"),
        };
        foreach (var remote in SteamRemoteDirs()) dirs.Add((System.IO.Path.Combine(remote, "characters"), "Steam cloud"));
        return dirs.Where(d => Directory.Exists(d.Item1)).ToList();
    }

    static List<string> WorldDirs()
    {
        var dirs = new List<string> { System.IO.Path.Combine(ValheimDir, "worlds_local"), System.IO.Path.Combine(ValheimDir, "worlds") };
        foreach (var remote in SteamRemoteDirs()) dirs.Add(System.IO.Path.Combine(remote, "worlds"));
        return dirs.Where(Directory.Exists).ToList();
    }

    static bool IsBackup(string name) => name.Contains("_backup_", StringComparison.OrdinalIgnoreCase);

    public static List<CharacterSave> FindCharacters()
    {
        var list = new List<CharacterSave>();
        foreach (var (dir, where) in CharacterDirs())
            foreach (var path in Directory.EnumerateFiles(dir, "*.fch"))
            {
                var name = System.IO.Path.GetFileNameWithoutExtension(path);
                if (IsBackup(name)) continue;
                list.Add(new CharacterSave(path.ToLowerInvariant(), name, where, dir));
            }
        return list.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ThenBy(c => c.Where).ToList();
    }

    /// <summary>Every save of the character in its folder, oldest first.</summary>
    public static List<SaveFile> History(CharacterSave c)
    {
        if (!Directory.Exists(c.Dir)) return [];
        string main = c.Name + ".fch", old = c.Name + ".fch.old", backup = c.Name + "_backup_";
        return Directory.EnumerateFiles(c.Dir)
            .Where(p =>
            {
                var f = System.IO.Path.GetFileName(p);
                return f.Equals(main, StringComparison.OrdinalIgnoreCase)
                    || f.Equals(old, StringComparison.OrdinalIgnoreCase)
                    || f.StartsWith(backup, StringComparison.OrdinalIgnoreCase) && f.EndsWith(".fch", StringComparison.OrdinalIgnoreCase);
            })
            .Select(p => new SaveFile(p, File.GetLastWriteTimeUtc(p)))
            .OrderBy(s => s.Time)
            .ToList();
    }

    /// <summary>
    /// World files for seed matching: each local world's .fwl (or newest _main.N.fwl2),
    /// and each worlds_local\&lt;name&gt;\cacheMinimapMeta (1.0 writes it for server worlds too).
    /// </summary>
    public static List<HintFile> WorldHints()
    {
        var hints = new List<HintFile>();
        foreach (var dir in WorldDirs())
        {
            foreach (var fwl in Directory.EnumerateFiles(dir, "*.fwl"))
                if (!IsBackup(fwl)) Add(hints, "fwl", System.IO.Path.GetFileName(fwl), fwl);
            foreach (var world in Directory.EnumerateDirectories(dir))
            {
                var name = System.IO.Path.GetFileName(world);
                if (IsBackup(name)) continue;
                var fwl2 = Directory.EnumerateFiles(world, "_main.*.fwl2").MaxBy(File.GetLastWriteTimeUtc);
                if (fwl2 != null) Add(hints, "fwl", name + ".fwl2", fwl2);
                var meta = System.IO.Path.Combine(world, "cacheMinimapMeta");
                if (File.Exists(meta)) Add(hints, "meta", name, meta);
            }
        }
        return hints;
    }

    /// <summary>
    /// The clock of each local world as of a character save: the first 12 bytes
    /// (version, seconds) of the world save, or world backup, written closest to it
    /// within 15 minutes; none otherwise (the site shows no day rather than a wrong one).
    /// </summary>
    public static List<HintFile> WorldClocks(DateTime saveTime)
    {
        var best = new Dictionary<string, (string Path, TimeSpan Off)>(StringComparer.OrdinalIgnoreCase);
        void Consider(string world, string path)
        {
            var off = (File.GetLastWriteTimeUtc(path) - saveTime).Duration();
            if (off <= SameSave && (!best.TryGetValue(world, out var b) || off < b.Off)) best[world] = (path, off);
        }
        foreach (var dir in WorldDirs())
        {
            foreach (var db in Directory.EnumerateFiles(dir, "*.db"))
                Consider(WorldName(System.IO.Path.GetFileNameWithoutExtension(db)), db);
            foreach (var world in Directory.EnumerateDirectories(dir))
                foreach (var db2 in Directory.EnumerateFiles(world, "_main.*.db2"))
                    Consider(WorldName(System.IO.Path.GetFileName(world)), db2);
        }
        var hints = new List<HintFile>();
        foreach (var (world, (path, _)) in best)
        {
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var head = new byte[12];
                if (fs.Read(head) == 12) hints.Add(new HintFile("clock", world, head));
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        return hints;
    }

    /// <summary>"name_backup_auto-20261103-183546" is a backup of world "name".</summary>
    static string WorldName(string fileOrDir)
    {
        int i = fileOrDir.IndexOf("_backup_", StringComparison.OrdinalIgnoreCase);
        return i < 0 ? fileOrDir : fileOrDir[..i];
    }

    static void Add(List<HintFile> hints, string field, string name, string path)
    {
        try
        {
            if (new FileInfo(path).Length > MaxHintBytes) return;
            var bytes = ReadShared(path);
            if (bytes != null) hints.Add(new HintFile(field, name, bytes));
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    /// <summary>Reads a file the game may be touching; null if it's gone or stays locked.</summary>
    public static byte[]? ReadShared(string path)
    {
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var bytes = new byte[fs.Length];
                fs.ReadExactly(bytes);
                return bytes;
            }
            catch (FileNotFoundException) { return null; }
            catch (DirectoryNotFoundException) { return null; }
            catch (IOException) when (attempt < 4) { Thread.Sleep(1000); }
            catch (IOException) { return null; }
        }
    }
}
