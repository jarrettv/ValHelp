using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleAdmin;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string DiscordId { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
    public string[] Roles { get; set; } = [];
    public string AvatarUrl { get; set; } = null!;
    public string Youtube { get; set; } = "";
    public string Twitch { get; set; } = "";
    public bool IsActive { get; set; }

    public string SteamId { get; set; } = "";
    public string AltName { get; set; } = "";

    public string ObsSecretCode { get; set; } = "";

    public List<Player> Players { get; set; } = [];
}

public class Avatar
{
    public string Hash { get; set; } = null!;
    public byte[] Data { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public DateTime UploadedAt { get; set; }
}

public class Scoring
{
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public Dictionary<string, int> Scores { get; set; } = [];
    public string DropRateType { get; set; } = "Vanilla"; // 100%
    public Dictionary<string, float> Rates { get; set; } = [];
    public string[] Modes { get; set; } = null!;
    public bool IsActive { get; set; } = true;

}
