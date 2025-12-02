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

    internal void Update(TrackLog log)
    {
        Score = log.Score; // we always assume the latest log has the correct score
        foreach (var playerLog in log.Logs)
        {
            var existingLogs = Logs.Where(x => x.Code == playerLog.Code);
            bool found = false;
            foreach (var existingLog in existingLogs)
            {
                if (playerLog.Code.StartsWith("Trophy") || playerLog.Code.StartsWith("Bonus"))
                {
                    found = true; // only 1 trophy and bonus per type allowed
                    continue;
                }
            }
            if (!found)
            {
                Logs.Add(new PlayerLog(playerLog.Code, playerLog.At));
            }
        }
        UpdatedAt = log.At;
    }
}

public record PlayerLog(string Code, DateTime At);

public enum PlayerStatus // positive for in, negative for out
{
    PlayerOut = -2,
    OwnerOut = -1,
    PlayerIn = 0,
    OwnerIn = 1,
    Disqualified = -10,
}

