using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vh.Tracker;

/// <summary>What the tracker remembers, in &lt;data dir&gt;\tracker.json.</summary>
public sealed class Config
{
    public const string DefaultServer = "https://valheim.help";

    public string Server { get; set; } = DefaultServer;
    /// <summary>Bearer token from device pairing; null until linked.</summary>
    public string? Token { get; set; }
    /// <summary>By the character's main .fch path (lower case).</summary>
    public Dictionary<string, CharacterState> Characters { get; set; } = [];

    public static Config Load(string path)
    {
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize(File.ReadAllText(path), TrackerJson.Default.Config) ?? new Config();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            Log.Write($"Config unreadable, starting fresh: {ex.Message}");
        }
        return new Config();
    }

    public void Save(string path)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(this, TrackerJson.Default.Config));
        File.Move(tmp, path, overwrite: true);
    }
}

public sealed class CharacterState
{
    public bool Enabled { get; set; }
    /// <summary>File time of the newest save already sent; older saves are never resent.</summary>
    public DateTime? Uploaded { get; set; }
}

public record StartReq(string Name);
public record StartResp(string DeviceCode, string UserCode, string VerifyUrl, int ExpiresIn, int Interval);
public record TokenReq(string DeviceCode);
public record TokenResp(string Status, string? Token);
public record UploadResp(string Status, long CharacterId, long? SnapshotId, int? Session);

[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(Config))]
[JsonSerializable(typeof(StartReq))]
[JsonSerializable(typeof(StartResp))]
[JsonSerializable(typeof(TokenReq))]
[JsonSerializable(typeof(TokenResp))]
[JsonSerializable(typeof(UploadResp))]
partial class TrackerJson : JsonSerializerContext;

/// <summary>Appends to &lt;data dir&gt;\tracker.log, keeping one older copy past 512 KB.</summary>
public static class Log
{
    static readonly object gate = new();
    public static string Path { get; set; } = "tracker.log";

    public static void Write(string line)
    {
        lock (gate)
        {
            try
            {
                var info = new FileInfo(Path);
                if (info.Exists && info.Length > 512 << 10) File.Move(Path, Path + ".old", overwrite: true);
                File.AppendAllText(Path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}{Environment.NewLine}");
            }
            catch (IOException) { }
        }
    }
}
