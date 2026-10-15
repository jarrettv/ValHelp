namespace SeedGen;

public sealed class SeedGenOptions
{
    public const string Section = "SeedGen";

    public string DataDir { get; set; } = "/data";
    public string ServerDir { get; set; } = "/valheim";
    public string WorldsDir { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".config/unity3d/IronGate/Valheim/worlds_local");
    // 1.0 builds the 2048² biome/sub-biome data before placing locations, so
    // world creation takes noticeably longer than it used to.
    // Normal jobs skip dungeon sampling (see oracle/OraclePlugin.cs DungeonPrefabs),
    // so generation plus the loot dump fits comfortably. Oracle jobs, which do
    // sample dungeons, get OracleTimeoutSec on top.
    public int ServerTimeoutSec { get; set; } = 600;

    /// <summary>
    /// Extra budget on top of <see cref="ServerTimeoutSec"/> for oracle jobs. The
    /// plugin sweeps 2048² calling GetBiomeHeight (up to ~83 Perlin samples each)
    /// single-threaded on the server's main thread, so it needs real headroom.
    /// </summary>
    public int OracleTimeoutSec { get; set; } = 600;

    public string SeedDir(int worldGen, int seedHash)
        => Path.Combine(DataDir, $"v{worldGen}", $"seed{seedHash}");
}
