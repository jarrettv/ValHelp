using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Admin;
public static class DbEndpoints
{
  public static void MapDbEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/db");
    api.MapGet("migrate", async (AppDbContext db) =>
    {
      await db.Database.MigrateAsync();
      return Results.Ok("Database migrated");
    });
    api.MapPost("seed-user", async (SeedUserReq req, AppDbContext db) =>
    {
      var user = new User
      {
        Username = req.Username,
        Email = req.Email,
        DiscordId = req.DiscordId,
        AvatarUrl = req.AvatarUrl,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        LastLoginAt = DateTime.UtcNow,
        IsActive = true,
      };
      db.Users.Add(user);
      await db.SaveChangesAsync();
      return TypedResults.Ok(new { id = user.Id });
    }); // TODO: require authorization by admin
  }
  
  public record SeedUserReq(string Username, string Email, string DiscordId, string AvatarUrl);
}