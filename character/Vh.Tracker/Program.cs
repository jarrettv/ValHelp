using System.Security.Cryptography;
using System.Text;

namespace Vh.Tracker;

/// <summary>
/// ValHelpTracker.exe [--server URL] [--data DIR]
///   --server  site to upload to (remembered); default https://valheim.help
///   --data    where tracker.json and tracker.log live; default %LOCALAPPDATA%\ValHelp\Tracker
/// One instance per data folder.
/// </summary>
static class Program
{
    static int Main(string[] args)
    {
        string? server = Arg(args, "--server");
        string dataDir = Arg(args, "--data") ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ValHelp", "Tracker");
        dataDir = Path.GetFullPath(dataDir);
        Directory.CreateDirectory(dataDir);

        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(dataDir.ToLowerInvariant())))[..12];
        using var single = new Mutex(true, @"Local\ValHelpTracker-" + id, out bool first);
        if (!first) return 0;

        Log.Path = Path.Combine(dataDir, "tracker.log");
        Log.Write($"Started {Environment.ProcessPath}");
        // A first run of the installed copy (not a --data test copy) also starts with Windows.
        var tracker = new Tracker(Path.Combine(dataDir, "tracker.json"), server, registerStartup: !args.Contains("--data"));
        var tray = new Tray(tracker, Log.Path);
        tracker.Start();
        if (tracker.FirstRun) tracker.StartLink();
        tray.Run();
        Log.Write("Exited");
        return 0;
    }

    static string? Arg(string[] args, string name)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
