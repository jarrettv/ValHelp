namespace SeedGen;

public sealed class SeedGenOptions
{
    public const string Section = "SeedGen";

    public string DataDir { get; set; } = "/data";
    public string ServerDir { get; set; } = "/valheim";
    public string WorldsDir { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".config/unity3d/IronGate/Valheim/worlds_local");
    public int ServerTimeoutSec { get; set; } = 180;

    public string SeedDir(int worldGen, int seedHash)
        => Path.Combine(DataDir, $"v{worldGen}", $"seed{seedHash}");
}
