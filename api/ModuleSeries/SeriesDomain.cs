
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleSeries;

public class Season
{
    public string Code { get; set; } = null!; // hunt-ash, hunt-bog, hunt-arm, blitz-arm, blaze-arm, private, versus
    public string Name { get; set; } = null!; // "Call to Arms Trailblazer"
    public string Pitch { get; set; } = null!; // "The original trophy hunt, vanilla drop rates, bring skills and luck"
    public string Mode { get; set; } = null!; // sent from Mod: "TrophyHunt", "Trailblazer", etc.
    public List<ScoreItem> ScoreItems { get; set; } = [];
    public List<SeasonAdmin> Admins { get; set; } = [];
    public SeasonStats Stats { get; set; } = null!;
    public string Desc { get; set; } = null!;
    public float Hours { get; set; }
    public Schedule Schedule { get; set; } = null!;
    public int OwnerId { get; set; } // FK to user
    public User Owner { get; set; } = null!;// navigation property

    public List<Event> Events { get; set; } = [];

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = null!;
    public DateTime UpdatedAt { get; set; }
    public string UpdatedBy { get; set; } = null!;
}


public record ScoreItem
{
    public string Code { get; set; } = null!;
    public int Score { get; set; }
    public string Name { get; set; } = null!;
    public float? DropRate { get; set; }
    public string? Rarity { get; set; }
}

public record SeasonAdmin
{
    public string Name { get; set; } = null!;
    public int UserId { get; set; }
}

public record SeasonStats
{
    public int TotalEvents { get; set; }
    public int TotalPlayers { get; set; }
    public int UniquePlayers { get; set; }

    public List<Achievement> Achievements { get; set; } = [];
}

// Fastest Eik/Elder/Bonemass, Fastest 100 points, Best scores, etc.
public record Achievement(string Code, string Name, string AvatarUrl, string Stream,
  int EventId, int UserId, int Score, DateTime UpdatedAt);

public record Schedule
{
    public string Name { get; set; } = null!; // "Every other Saturday, alternating times"
    public string EventNameTemplate { get; set; } = null!; // "Trophy Hunt #{eventNum}" or "Trailblazer S{seasonNum}E{eventNum}"
    public int SeasonNum { get; set; } // use 0 if it doesn't matter
    public int EventNumInit { get; set; } // typically 1 but for continuing stuff, like hunt
    public List<ScheduledEvent> Events { get; set; } = [];
}

public record ScheduledEvent
{
    public int EventNum { get; set; }
    public DateTime StartAt { get; set; }
    public string Name { get; set; } = null!; // "Trophy Hunt #5"
    public float Hours { get; set; }
}
