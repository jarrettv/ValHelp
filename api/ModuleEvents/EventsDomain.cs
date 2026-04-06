using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleSeries;
using ValHelpApi.ModuleTrack;

namespace ValHelpApi.ModuleEvents;


public class Event
{
    public int Id { get; set; }

    public string? SeasonCode { get; set; }
    public Season? Season { get; set; }

    public string Name { get; set; } = null!;
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public EventStatus Status { get; set; }
    public string Mode { get; set; } = null!;
    public string ScoringCode { get; set; } = null!;
    public Scoring Scoring { get; set; } = null!;
    public float Hours { get; set; }
    public string Desc { get; set; } = null!;
    public string Seed { get; set; } = null!;
    public Dictionary<string, string> Prizes { get; set; } = null!;
    public List<Player> Players { get; set; } = [];
    public bool IsPrivate { get; set; } = false;
    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public string? PrivatePassword { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = null!;
    public DateTime UpdatedAt { get; set; }
    public string UpdatedBy { get; set; } = null!;
}

public enum EventStatus
{
    Draft = 0,
    New = 10,
    Live = 20, // between StartAt and EndAt
    Over = 30, // after EndAt
    Old = 50, // after 4 months
    Archive = 55, // force hide
    Deleted = 60
}

public class Player
{
    public int EventId { get; set; }
    public Event Event { get; set; } = null!;

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public string Name { get; set; } = null!;
    public string AvatarUrl { get; set; } = null!;
    public string Stream { get; set; } = null!;
    public PlayerStatus Status { get; set; }
    public int Score { get; set; }
    public List<PlayerLog> Logs { get; set; } = [];
    public DateTime UpdatedAt { get; set; }
    public uint Version { get; set; }

    public void Update(DateTime at, int score, string[]? trophies, int deaths, int logouts)
    {
        Score = score;

        if (trophies != null)
        {
            foreach (var trophy in trophies)
            {
                if (string.IsNullOrWhiteSpace(trophy))
                {
                    continue;
                }
                if (!Logs.Any(x => x.Code == trophy.Trim()))
                {
                    Logs.Add(new PlayerLog(trophy.Trim(), at));
                }
            }
        }

        while (Logs.Count(x => x.Code == "PenaltyDeath") < deaths)
        {
            Logs.Add(new PlayerLog("PenaltyDeath", at));
        }

        while (Logs.Count(x => x.Code == "PenaltyLogout") < logouts)
        {
            Logs.Add(new PlayerLog("PenaltyLogout", at));
        }
        UpdatedAt = at;
    }

    internal void Update(TrackLog log, DateTime eventStartAt)
    {
        Score = log.Score; // we always assume the latest log has the correct score
        foreach (var playerLog in log.Logs)
        {
            if (CompactEventParser.IsCompactFormat(playerLog.Code))
            {
                UpdateCompact(playerLog.Code, eventStartAt);
            }
            else
            {
                UpdateLegacy(playerLog);
            }
        }
        UpdatedAt = log.At;
    }

    private void UpdateCompact(string code, DateTime eventStartAt)
    {
        var events = CompactEventParser.Parse(code);
        foreach (var evt in events)
        {
            var at = eventStartAt.AddSeconds(evt.Secs);

            switch (evt.Tag)
            {
                case 'T':
                {
                    // extra = "Neck" or "Neck|BonusMeadows" or "Fader|BonusAshlands|BonusAll|BonusTime=840"
                    var parts = evt.Extra.Split('|', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var part in parts)
                    {
                        var logCode = part.StartsWith("Bonus") ? part : $"Trophy{part}";
                        AddLogIfNew(logCode, at, evt.X, evt.Y, evt.Z);
                    }
                    break;
                }
                case 'D':
                    AddLogIfNew("PenaltyDeath", at, evt.X, evt.Y, evt.Z);
                    break;
                case 'L':
                    AddLogIfNew("PenaltyLogout", at, evt.X, evt.Y, evt.Z);
                    break;
                case 'S':
                    AddLogIfNew("PenaltySlashDie", at, evt.X, evt.Y, evt.Z);
                    break;
                case 'J':
                {
                    // extra = "Portal", "Portal=base", or "Respawn"
                    var portalName = evt.Extra;
                    if (portalName.StartsWith("Portal"))
                    {
                        // Store as "Portal" or "Portal:<name>"
                        var eqIdx = portalName.IndexOf('=');
                        var logCode = eqIdx >= 0 ? $"Portal:{portalName[(eqIdx + 1)..]}" : "Portal";
                        AddLogIfNew(logCode, at, evt.X, evt.Y, evt.Z);
                    }
                    // Respawn jumps don't need a separate log — the PenaltyDeath covers the death itself
                    break;
                }
                // F, W, P — telemetry only, no player log needed
            }
        }
    }

    private void UpdateLegacy(TrackerLog playerLog)
    {
        // Path and Snap are telemetry-only, don't store in player event logs
        if (playerLog.Code.StartsWith("Path=") || playerLog.Code.StartsWith("Snap="))
            return;

        // Parse position suffix: "TrophyBoar@142,32,-87" → code="TrophyBoar", pos=(142,32,-87)
        var (rawCode, x, y, z) = ParseCodePosition(playerLog.Code);

        // Split pipe-delimited multi-events: "TrophyNeck|BonusMeadows" → ["TrophyNeck", "BonusMeadows"]
        var segments = rawCode.Split('|', StringSplitOptions.RemoveEmptyEntries);

        foreach (var code in segments)
        {
            AddLogIfNew(code, playerLog.At, x, y, z);
        }
    }

    private void AddLogIfNew(string code, DateTime at, int x, int y, int z)
    {
        if (code.StartsWith("Trophy") || code.StartsWith("Bonus"))
        {
            // Only 1 per type allowed (dedup by clean code, ignoring position)
            if (Logs.Any(x => x.Code == code))
                return;
        }
        else
        {
            // Penalties etc: dedup within 4-second window
            foreach (var existing in Logs.Where(x => x.Code == code))
            {
                if ((existing.At - at).Duration() <= TimeSpan.FromSeconds(4))
                    return;
            }
        }
        Logs.Add(new PlayerLog(code, at, x, y, z));
    }

    private static (string code, int x, int y, int z) ParseCodePosition(string raw)
    {
        var atIdx = raw.LastIndexOf('@');
        if (atIdx < 0) return (raw, 0, 0, 0);

        var code = raw[..atIdx];
        var parts = raw[(atIdx + 1)..].Split(',');
        if (parts.Length != 3) return (raw, 0, 0, 0);

        if (int.TryParse(parts[0], out var x) &&
            int.TryParse(parts[1], out var y) &&
            int.TryParse(parts[2], out var z))
            return (code, x, y, z);

        return (raw, 0, 0, 0);
    }
}

public record PlayerLog(string Code, DateTime At, int? X = null, int? Y = null, int? Z = null);

public enum PlayerStatus // positive for in, negative for out
{
    PlayerOut = -2,
    OwnerOut = -1,
    PlayerIn = 0,
    OwnerIn = 1,
    Disqualified = -10,
}

