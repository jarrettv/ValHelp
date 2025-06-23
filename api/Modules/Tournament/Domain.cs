using ValHelpApi.Modules.Admin;

namespace ValHelpApi.Modules.Tournament;

public class Series
{
  public string Code { get; set; } = null!; // hunt, saga champ, saga brute, private, versus
  public string Name { get; set; } = null!;
  public string Pitch { get; set; } = null!; // "The original trophy hunt, vanilla drop rates, bring skills and luck"
  public EventOptions Options { get; set; } = null!;

  public SeriesInfo Info { get; set; } = null!;

  public List<Rounds> Rounds { get; set; } = [];

  public int OwnerId { get; set; }
  public User Owner { get; set; } = null!;

  public bool IsActive { get; set; } = true;
  
  public DateTime CreatedAt { get; set; }
  public string CreatedBy { get; set; } = null!;
  public DateTime UpdatedAt { get; set; }
  public string UpdatedBy { get; set; } = null!;
}

public class SeriesInfo
{
  public int TotalEvents { get; set; }
  public int TotalPlayers { get; set; }
  public int UniquePlayers { get; set; }

  public List<PlayerRecord> Records { get; set; } = [];
}

public record PlayerRecord(string Achievement, string Name, string AvatarUrl, string Stream, 
  int EventId, int UserId, int Score, DateTime UpdatedAt);

public class EventOptions
{
  public string Mode { get; set; } = null!;
  public string ScoringCode { get; set; } = null!;
  public int Hours { get; set; }
  public string NameTemplate { get; set; } = null!;
  public string Seed { get; set; } = null!;
  public string Desc { get; set; } = null!;
  public Dictionary<string, string> Prizes { get; set; } = null!;
}

public class Rounds
{
  public int Num { get; set; }
  public string SeriesCode { get; set; } = null!;
  public Series Series { get; set; } = null!;
  public string Tagline { get; set; } = null!; // "Best scores from 3 of 7 rounds win!"
  public EventOptions Options { get; set; } = null!; // can override series options
  public Schedule Schedule { get; set; } = null!;
  public List<RoundsAdmin> Admin { get; set; } = null!;
  public DateTime CreatedAt { get; set; }
  public string CreatedBy { get; set; } = null!;
  public DateTime UpdatedAt { get; set; }
  public string UpdatedBy { get; set; } = null!;
}

public class RoundsAdmin
{
  public string Role = "Admin"; // "Creator and owner";
  public string Name { get; set; } = null!;
  public int UserId { get; set; }
}

public class Schedule
{
  public string Name { get; set; } = null!; // "Every other Saturday, alternating times"
  public List<ScheduledEvent> Events { get; set; } = [];
}



public class ScheduledEvent
{
  public DateTime StartAt { get; set; }
  public string Name { get; set; } = null!;
  public float Hours { get; set; }
}

public class Scoring
{
  public string Code { get; set; } = null!;
  public string Name { get; set; } = null!;
  public Dictionary<string, int> Scores { get; set; } = [];
  public string[] Modes { get; set; } = null!;
  public bool IsActive { get; set; } = true;
}

public class ScoreItem
{
  public string Code { get; set; } = null!;
  public int Score { get; set; }
  public string Name { get; set; } = null!;
  public float? DropRate { get; set; }
  public string? Rarity { get; set; }
}



public class Event
{
  public int Id { get; set; }
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
    Score = log.Score;
    foreach (var playerLog in log.Logs)
    {
      var existingLogs = Logs.Where(x => x.Code == playerLog.Code);
      bool found = false;
      // sometimes we get a duplicate set of logs with
      foreach (var existingLog in existingLogs)
      {
        // if playerLog is within a few seconds of existingLog, skip
        if (Math.Abs((existingLog.At - playerLog.At).TotalSeconds) < 10)
        {
          found = true;
          continue;
        }
        else if (playerLog.Code.StartsWith("Trophy"))
        {
          found = true;
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

public class Item
{
  public string Code { get; set; } = null!;
  public string Name { get; set; } = null!;
  public string Biome { get; set; } = null!;
  public string Group { get; set; } = null!;
  public string Type { get; set; } = null!;
  public string Usage { get; set; } = null!;
  public float Weight { get; set; }
  public int Stack { get; set; }
  public int Tier { get; set; } // check Henrik and others for this
  public string ImageUrl { get; set; } = null!;
  public object Info { get; set; } = null!;
  public int Order { get; set; }
  public bool IsActive { get; set; } = true;
}

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

public record TrackerLog(string Code, DateTime At);

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