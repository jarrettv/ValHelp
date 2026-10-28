using System.Collections.Concurrent;

namespace SeedGen;

/// <summary>
/// A seed's map artifacts (textures, bvec) come from the managed worldgen, so a
/// worldgen fix makes the cached ones stale. Each seed dir is stamped with
/// <see cref="Version"/> in <c>art.ver</c>; artifacts from an older seedgen are
/// regenerated (a few seconds, no server boot) the first time one is asked for.
/// </summary>
public static class ArtifactCache
{
    /// <summary>Bump whenever ArtifactGenerator's output changes.</summary>
    // 1 (no art.ver): before the oracle regression tests.
    // 2: heights bit-exact with the game (Ashlands FastNoise in double, rivers, Deep North).
    public const int Version = 2;

    public static readonly HashSet<string> Files = ["mapTexCache", "forestMaskTexCache", "heightTexCache", "bvec"];

    static readonly ConcurrentDictionary<string, object> s_locks = new();

    public static void MarkCurrent(string dir) =>
        File.WriteAllText(Path.Combine(dir, "art.ver"), Version.ToString());

    static bool IsCurrent(string dir) =>
        File.Exists(Path.Combine(dir, "art.ver")) &&
        int.TryParse(File.ReadAllText(Path.Combine(dir, "art.ver")), out var v) && v == Version;

    public static void EnsureCurrent(string dir, int seedHash, int worldGen, ArtifactGenerator generator)
    {
        // Only seeds that have artifacts to refresh; a missing seed is a 404 as before.
        if (IsCurrent(dir) || !File.Exists(Path.Combine(dir, "bvec"))) return;
        lock (s_locks.GetOrAdd(dir, _ => new object()))
        {
            if (IsCurrent(dir)) return;
            generator.GenerateAll($"seed{seedHash}", seedHash, worldGen, dir);
            MarkCurrent(dir);
        }
    }
}
