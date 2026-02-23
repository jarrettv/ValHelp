using ValHelpApi.ModuleAdmin;

namespace ValHelpApi.ModuleRuns;

public class Run
{
    public int Id { get; set; }

    public string Name { get; set; } = "";

    public string Category { get; set; } = "";

    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;

    public int DurationSeconds { get; set; } = 7200;

    public List<RunEvent> Events { get; set; } = [];

    public RunRecord Record { get; set; } = new();

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class RunEvent
{
    public int Time { get; set; }
    public string Kind { get; set; } = "item"; // item | station
    public string Label { get; set; } = "";
    public string? Code { get; set; } // item code, when Kind=item
    public string? Type { get; set; } // Food/Gear/Station (UI hint)
}

public class RunRecord
{
    public bool World { get; set; }
    public bool Personal { get; set; }
    public RunStatus Status { get; set; }
    public DateTime? RecordFrom { get; set; }
    public DateTime? RecordTo { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string VerifiedBy { get; set; } = "";
}

public enum RunStatus
{
    Rejected = -1,
    Unverified = 0,
    Verified = 1,
}