namespace ValHelpApi.Modules.Admin;

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
}