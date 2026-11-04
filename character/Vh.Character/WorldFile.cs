namespace Vh.Character;

/// <summary>World metadata from a .fwl (or 1.0 chunked _main.N.fwl2): enough to tie a character's world UID to a seed.</summary>
public sealed record WorldMeta(int Version, string Name, string SeedName, int Seed, long Uid, int WorldGenVersion);

/// <summary>Mirrors the head of World.LoadWorld in 1.0.21.</summary>
public static class WorldFile
{
    private const int WOldest = 9, WWorldGenVersion = 26, WLatest = 42;

    public static WorldMeta Read(string path) => Parse(File.ReadAllBytes(path));

    /// <summary>File layout: int length, world package (name, seed name, seed hash, uid, ...).</summary>
    public static WorldMeta Parse(byte[] file)
    {
        var r = new GameReader(new GameReader(file).ByteArray());
        int v = r.Int();
        if (v < WOldest || v > WLatest) throw new InvalidDataException($"unsupported world version {v}");
        string name = r.String();
        string seedName = r.String();
        int seed = r.Int();
        long uid = r.Long();
        int genVersion = v >= WWorldGenVersion ? r.Int() : 0;
        return new WorldMeta(v, name, seedName, seed, uid, genVersion);
    }

    /// <summary>
    /// worlds_local/&lt;world name&gt;/cacheMinimapMeta (1.0+): int seed hash, int cache version.
    /// The client writes it for server worlds too, so it ties a world name to a seed hash
    /// even when there is no local .fwl.
    /// </summary>
    public static (int Seed, int Version) ParseMinimapMeta(byte[] meta) =>
        (BitConverter.ToInt32(meta, 0), BitConverter.ToInt32(meta, 4));

    /// <summary>
    /// The start of a world save (&lt;name&gt;.db, 1.0 &lt;name&gt;/_main.N.db2): data version, then
    /// the world clock (ZNet.m_netTime, seconds; .db only from SupportNetTime).
    /// </summary>
    public static (int Version, double NetTime) ParseDbHeader(byte[] head)
    {
        if (head.Length < 12) throw new InvalidDataException("World save header too short");
        return (BitConverter.ToInt32(head, 0), BitConverter.ToDouble(head, 4));
    }

    /// <summary>EnvMan.m_dayLengthSec: the world clock runs this many seconds a day.</summary>
    public const double DayLengthSeconds = 1200;

    /// <summary>string.GetStableHashCode: the int seed the game derives from the seed name.</summary>
    public static int StableHash(string s)
    {
        int h1 = 5381, h2 = h1;
        for (int i = 0; i < s.Length; i += 2)
        {
            h1 = ((h1 << 5) + h1) ^ s[i];
            if (i + 1 < s.Length) h2 = ((h2 << 5) + h2) ^ s[i + 1];
        }
        return h1 + h2 * 1566083941;
    }
}
