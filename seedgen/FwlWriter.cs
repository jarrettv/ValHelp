using System.Text;

namespace SeedGen;

/// <summary>
/// Creates Valheim .fwl (world metadata) files in the ZPackage binary format.
/// </summary>
public static class FwlWriter
{
    public static void Write(string fwlPath, string seedName, string worldName, int worldGenVersion)
    {
        int seedHash = ValheimSeedHash.GetStableHashCode(seedName);
        long uid = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        using var payload = new MemoryStream();
        using var pw = new BinaryWriter(payload, Encoding.UTF8);
        pw.Write(37); // Valheim save version — must match current game version
        pw.Write(worldName);
        pw.Write(seedName);
        pw.Write(seedHash);
        pw.Write(uid);
        pw.Write(worldGenVersion);  // v26+
        pw.Write(false);            // v30+ needsDB — false so server doesn't expect an existing .db
        pw.Write(0);                // v32+ startingGlobalKeys count
        pw.Flush();

        var bytes = payload.ToArray();
        using var fs = File.Create(fwlPath);
        using var fw = new BinaryWriter(fs);
        fw.Write(bytes.Length);
        fw.Write(bytes);
    }
}
