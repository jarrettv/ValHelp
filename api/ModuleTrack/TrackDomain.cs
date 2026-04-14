namespace ValHelpApi.ModuleTrack;

public class TrackLog
{
    public DateTime At { get; set; } // this is the key for the table
    public string Id { get; set; } = null!;
    public string User { get; set; } = null!;
    public string Seed { get; set; } = null!;
    public string Mode { get; set; } = null!;
    public int Score { get; set; }
    public List<TrackerLog> Logs { get; set; } = [];
}
public record TrackerLog(string Code, DateTime At);

/// <summary>
/// Parsed event from the new compact format: tag=secs@x,y,z[|extra];
/// </summary>
public record CompactEvent(char Tag, int Secs, int X, int Y, int Z, string Extra);

/// <summary>
/// Snapshot of a player's state parsed from P tag extras:
/// h:cur/max|s:cur/max|f:food1,food2|sk:Skill:level,...|eq:H=item,C=item,G=item|kd:Creature:kills/deaths,...
/// </summary>
public record PlayerStateSnapshot(
    int T,
    int Hp, int HpMax,
    int Sp, int SpMax,
    string[] Foods,
    Dictionary<string, int> Skills,
    Dictionary<string, string> Equipment,
    Dictionary<string, int[]> KillDeaths
);

public static class CompactEventParser
{
    private static readonly HashSet<char> ValidTags = ['F', 'W', 'P', 'J', 'T', 'D', 'L', 'S'];

    /// <summary>
    /// Returns true if the code string uses the new compact format: starts with a known tag letter followed by '='.
    /// </summary>
    public static bool IsCompactFormat(string code)
        => code.Length >= 2 && code[1] == '=' && ValidTags.Contains(code[0]);

    /// <summary>
    /// Parse the pipe-delimited extras from a P tag into a PlayerStateSnapshot.
    /// Format: h:cur/max|s:cur/max|f:food1,food2|sk:Skill:level,...|eq:H=item,...|kd:Creature:kills/deaths,...
    /// </summary>
    public static PlayerStateSnapshot? ParsePExtras(int secs, string extra)
    {
        if (string.IsNullOrEmpty(extra)) return null;

        int hp = 0, hpMax = 0, sp = 0, spMax = 0;
        string[] foods = [];
        var skills = new Dictionary<string, int>();
        var equipment = new Dictionary<string, string>();
        var killDeaths = new Dictionary<string, int[]>();

        foreach (var field in extra.Split('|'))
        {
            if (field.Length < 2) continue;
            var colonIdx = field.IndexOf(':');
            if (colonIdx < 0) continue;
            var key = field[..colonIdx];
            var val = field[(colonIdx + 1)..];

            switch (key)
            {
                case "h":
                {
                    var slash = val.IndexOf('/');
                    if (slash > 0)
                    {
                        int.TryParse(val[..slash], out hp);
                        int.TryParse(val[(slash + 1)..], out hpMax);
                    }
                    break;
                }
                case "s":
                {
                    var slash = val.IndexOf('/');
                    if (slash > 0)
                    {
                        int.TryParse(val[..slash], out sp);
                        int.TryParse(val[(slash + 1)..], out spMax);
                    }
                    break;
                }
                case "f":
                    foods = val.Split(',', StringSplitOptions.RemoveEmptyEntries);
                    break;
                case "sk":
                    foreach (var entry in val.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var c = entry.IndexOf(':');
                        if (c > 0 && int.TryParse(entry[(c + 1)..], out var lvl))
                            skills[entry[..c]] = lvl;
                    }
                    break;
                case "eq":
                    foreach (var entry in val.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var eq = entry.IndexOf('=');
                        if (eq > 0)
                            equipment[entry[..eq]] = entry[(eq + 1)..];
                    }
                    break;
                case "kd":
                    foreach (var entry in val.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var c = entry.IndexOf(':');
                        if (c <= 0) continue;
                        var creature = entry[..c];
                        var kv = entry[(c + 1)..];
                        var slash = kv.IndexOf('/');
                        if (slash > 0 &&
                            int.TryParse(kv[..slash], out var kills) &&
                            int.TryParse(kv[(slash + 1)..], out var deaths))
                        {
                            killDeaths[creature] = [kills, deaths];
                        }
                    }
                    break;
            }
        }

        return new PlayerStateSnapshot(secs, hp, hpMax, sp, spMax, foods, skills, equipment, killDeaths);
    }

    /// <summary>
    /// Parse "W=5247@1138,44,495;W=5252@1126,43,486;" into CompactEvent records.
    /// </summary>
    public static List<CompactEvent> Parse(string code)
    {
        var results = new List<CompactEvent>();
        foreach (var seg in code.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            // tag=secs@x,y,z  or  tag=secs@x,y,z|extra
            if (seg.Length < 2 || seg[1] != '=') continue;
            var tag = seg[0];

            var atIdx = seg.IndexOf('@');
            if (atIdx < 0) continue;

            if (!int.TryParse(seg.AsSpan(2, atIdx - 2), out var secs)) continue;

            // Split position from extra: "x,y,z|extra1|extra2" or just "x,y,z"
            var rest = seg[(atIdx + 1)..];
            var pipeIdx = rest.IndexOf('|');
            var coordPart = pipeIdx >= 0 ? rest[..pipeIdx] : rest;
            var extra = pipeIdx >= 0 ? rest[(pipeIdx + 1)..] : "";

            var coords = coordPart.Split(',');
            if (coords.Length != 3) continue;
            if (!int.TryParse(coords[0], out var x) ||
                !int.TryParse(coords[1], out var y) ||
                !int.TryParse(coords[2], out var z)) continue;

            results.Add(new CompactEvent(tag, secs, x, y, z, extra));
        }
        return results;
    }
}

public class TrackMap
{
    public string Seed { get; set; } = null!;
    public byte[] MapTex { get; set; } = [];
    public byte[] HeightTex { get; set; } = [];
    public byte[] MaskTex { get; set; } = [];
    public byte[]? Bvec { get; set; }
    public DateTime? BvecAt { get; set; }
    public string? Paths { get; set; }
    public DateTime UploadedAt { get; set; }
    public string UploadedBy { get; set; } = "";
}

public class TrackHunt
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public string PlayerName { get; set; } = null!;
    public string PlayerId { get; set; } = null!;

    public string SessionId { get; set; } = null!;
    public string PlayerLocation { get; set; } = null!;
    public int CurrentScore { get; set; }

    public int Deaths { get; set; }
    public int Logouts { get; set; }
    public string Trophies { get; set; } = "";

    public string Gamemode { get; set; } = null!;

    //public JsonNode Extra { get; set; } = new JsonObject();

}

// this is legacy, can remove eventually
public class Hunt
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string Desc { get; set; } = null!;
    public Dictionary<string, int> Scoring { get; set; } = null!;
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public string Seed { get; set; } = null!;
    public Dictionary<string, string> Prizes { get; set; } = null!;
    public HuntStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = null!;
    public DateTime UpdatedAt { get; set; }
    public string UpdatedBy { get; set; } = null!;

    public List<HuntsPlayer> Players { get; set; } = [];
}

public enum HuntStatus
{
    Draft = 0,
    New = 10,
    Live = 20, // between StartAt and EndAt
    Ended = 30, // after EndAt
    Over = 50, // after 4 months
    Archive = 55, // force hide
    Deleted = 60
}


// this is legacy, can remove eventually
public class HuntsPlayer
{
    public int HuntId { get; set; }
    public Hunt Hunt { get; set; } = null!;
    public string PlayerId { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Stream { get; set; } = null!;
    public HuntsPlayerStatus Status { get; set; }
    public int Score { get; set; }
    public int Deaths { get; set; }
    public int Relogs { get; set; }
    public string[] Trophies { get; set; } = [];
    public DateTime UpdatedAt { get; set; }
}

public enum HuntsPlayerStatus
{
    Normal = 0,
}
