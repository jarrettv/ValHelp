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
