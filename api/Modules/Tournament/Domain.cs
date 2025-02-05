using ValHelpApi.Modules.Admin;

namespace ValHelpApi.Modules.Tournament;

public class Scoring
{
  public string Code { get; set; } = null!;
  public string Name { get; set; } = null!;
  public Dictionary<string, int> Scores { get; set; } = null!;
  public List<string> Modes { get; set; } = null!;
  public bool IsActive { get; set; } = true;
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

  public void Update(DateTime at, int score, List<string>? trophies, int deaths, int logouts)
  {
    Score = score;

    if (trophies != null)
    {
      foreach (var trophy in trophies)
      {
        if (!Logs.Any(x => x.Code == trophy))
        {
          Logs.Add(new PlayerLog(trophy, at));
        }
      }
    }

    var deathsCount = Logs.Where(x => x.Code == "PenaltyDeath").Count();
    for (var i = deathsCount; i < deaths; i++)
    {
      Logs.Add(new PlayerLog("PenaltyDeath", at));
    }

    var logoutsCount = Logs.Where(x => x.Code == "PenaltyLogout").Count();
    for (var i = logoutsCount; i < logouts; i++)
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
      if (!Logs.Any(x => x.Code == playerLog.Code && x.At == playerLog.At))
      {
        Logs.Add(new PlayerLog(playerLog.Code, playerLog.At));
      }
    }
    UpdatedAt = log.At;
  }
}

public record PlayerLog(string Code, DateTime At);

public enum PlayerStatus
{
  Player = 0,
  PlayerAdmin = 1,
  NonPlayerAdmin = 2,
  Disqualified = 10,
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
  public List<string> Trophies { get; set; } = [];

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