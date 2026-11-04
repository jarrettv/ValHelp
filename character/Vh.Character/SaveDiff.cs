namespace Vh.Character;

/// <summary>
/// Comparing two saves of the same character: what changed, which world was
/// played, and where the later save sits on a play-time axis. Used by the API
/// to turn uploads into snapshots.
/// </summary>
public static class SaveDiff
{
    /// <summary>More than this between two saves starts a new play session.</summary>
    public static readonly TimeSpan SessionGap = TimeSpan.FromHours(1);

    /// <summary>Explored map tiles: 32 x 32 tiles of 64 x 64 cells over the 2048 grid.</summary>
    public const int TileCells = 64;

    static readonly int TimeInBase = Array.IndexOf(GameNames.PlayerStats, "TimeInBase");
    static readonly int TimeOutOfBase = Array.IndexOf(GameNames.PlayerStats, "TimeOutOfBase");

    /// <summary>The game's active play clock: in-world time, AFK excluded (seconds).</summary>
    public static float PlaySeconds(CharacterProfile p)
    {
        if (p.Stats.Count == 0) return 0;
        var v = p.Stats[0].Values;
        return (TimeInBase < v.Length ? v[TimeInBase] : 0) + (TimeOutOfBase < v.Length ? v[TimeOutOfBase] : 0);
    }

    public record Timing(int Session, float AxisSeconds, bool Rewind);

    /// <summary>
    /// Where a save lands on the timeline. The axis follows the play clock but
    /// never goes back: when the clock drops (a restored backup), the snapshot is
    /// a rewind and the axis stays put.
    /// </summary>
    public static Timing Place(DateTime fileTime, float play, DateTime? prevFileTime, int prevSession, float prevPlay, float prevAxis)
    {
        if (prevFileTime == null) return new Timing(1, play, false);
        int session = fileTime - prevFileTime.Value > SessionGap ? prevSession + 1 : prevSession;
        float delta = play - prevPlay;
        bool rewind = delta < -1f;
        return new Timing(session, prevAxis + Math.Max(0, delta), rewind);
    }

    /// <summary>
    /// The world played between two saves: the one whose fog, logout point, death
    /// point or pins changed (the most newly explored if several did), else null.
    /// </summary>
    public static long? ActiveWorld(CharacterProfile? prev, CharacterProfile cur)
    {
        long? best = null;
        int bestGain = int.MinValue;
        foreach (var w in cur.Worlds)
        {
            var old = prev?.Worlds.FirstOrDefault(o => o.WorldUid == w.WorldUid);
            int now = w.Map?.ExploredCount ?? 0;
            int before = old?.Map?.ExploredCount ?? 0;
            bool changed = old == null || now != before || w.Logout != old.Logout || w.Death != old.Death
                || (w.Map?.Pins.Count ?? 0) != (old.Map?.Pins.Count ?? 0);
            if (!changed) continue;
            int gain = now - before;
            if (gain > bestGain) { best = w.WorldUid; bestGain = gain; }
        }
        return best;
    }

    /// <summary>World names whose play time grew since the previous save (KnownWorlds is written one save late).</summary>
    public static string[] PlayedWorldNames(CharacterProfile? prev, CharacterProfile cur)
    {
        if (cur.Stats.Count == 0) return [];
        var before = prev?.Stats.Count > 0 ? prev.Stats[0].KnownWorlds : [];
        return cur.Stats[0].KnownWorlds
            .Where(kv => kv.Value > before.GetValueOrDefault(kv.Key))
            .Select(kv => kv.Key).ToArray();
    }

    public record Tile(short Index, byte[] Explored, byte[]? Others);

    /// <summary>Tiles of a world's fog that differ from the previous save (all non-empty tiles when there is none).</summary>
    public static List<Tile> ChangedTiles(MapData? prev, MapData cur)
    {
        var tiles = new List<Tile>();
        int perSide = cur.Size / TileCells;
        for (int ty = 0; ty < perSide; ty++)
        for (int tx = 0; tx < perSide; tx++)
        {
            var explored = CutTile(cur.Explored, cur.Size, tx, ty);
            var others = CutTile(cur.ExploredOthers, cur.Size, tx, ty);
            var oldExplored = prev != null && prev.Size == cur.Size ? CutTile(prev.Explored, prev.Size, tx, ty) : null;
            var oldOthers = prev != null && prev.Size == cur.Size ? CutTile(prev.ExploredOthers, prev.Size, tx, ty) : null;
            bool same = oldExplored != null
                ? explored.AsSpan().SequenceEqual(oldExplored) && others.AsSpan().SequenceEqual(oldOthers)
                : IsEmpty(explored) && IsEmpty(others);
            if (same) continue;
            tiles.Add(new Tile((short)(ty * perSide + tx), explored, IsEmpty(others) ? null : others));
        }
        return tiles;
    }

    /// <summary>A tile's 64 rows, 8 bytes each, from a row-major bit-packed grid (rows are byte aligned).</summary>
    static byte[] CutTile(byte[] bits, int size, int tx, int ty)
    {
        var tile = new byte[TileCells * TileCells / 8];
        if (bits.Length == 0) return tile;
        for (int row = 0; row < TileCells; row++)
        {
            int from = ((ty * TileCells + row) * size + tx * TileCells) / 8;
            Buffer.BlockCopy(bits, from, tile, row * 8, 8);
        }
        return tile;
    }

    static bool IsEmpty(byte[] b) => !b.AsSpan().ContainsAnyExcept((byte)0);
}
