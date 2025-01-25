using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;

namespace ValHelp.ApiService.Modules.Tournament;

public class Hunt
{
  public int Id { get; set; }
  public string Name { get; set; } = null!;
  public string Desc { get; set; } = null!;
  public Dictionary<string, int> Scoring { get; set; } = null!;
  public DateTime StartAt { get; set; }
  public DateTime EndAt { get; set; }
  public string Seed { get; set; } = null!;
  public Dictionary<string, int> Prizes { get; set; } = null!;
  public HuntStatus Status { get; set; }
  public DateTime CreatedAt { get; set; }
  public string CreatedBy { get; set; } = null!;
  public DateTime UpdatedAt { get; set; }
  public string UpdatedBy { get; set; } = null!;

  public List<HuntPlayer> Players { get; set; } = [];
}

public enum HuntStatus
{
  Draft = 0,
  New = 10,
  Live = 20,
  Over = 30,
  Last = 40,
  Old = 50,
  Deleted = 60
}

public class HuntPlayer
{
  public int HuntId { get; set; }
  public string PlayerId { get; set; } = null!;
  public string Stream { get; set; } = null!;
  public HuntPlayerStatus Status { get; set; }
  public int Score { get; set; }
  public int Deaths { get; set; }
  //public int Dies { get; set; }
  public int Relogs { get; set; }

  public List<string> Trophies { get; set; } = [];

  public DateTime UpdatedAt { get; set; }
}

public enum HuntPlayerStatus
{
  Normal = 0,
  Disqualified = 10,
}

public class TrackHunt
{
  public int Id { get; set; }
  public DateTime CreatedAt { get; set; }
  public string PlayerName { get; set; } = null!;

  public string SessionId { get; set; } = null!;
  public string PlayerLocation { get; set; } = null!;
  public int CurrentScore { get; set; }

  public int Deaths { get; set; }
  public int Logouts { get; set; }
  public List<string> Trophies { get; set; } = [];

  public string Gamemode { get; set; } = null!;

  //public JsonNode Extra { get; set; } = new JsonObject();
}