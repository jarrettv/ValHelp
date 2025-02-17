using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.Modules.Tournament;

namespace ValHelpApi.Modules.Admin;
public static class DbEndpoints
{
  public static void MapDbEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/db");
    
    if (app.Environment.IsDevelopment())
    {
      api.MapGet("migrate", async (AppDbContext db) =>
      {
        await db.Database.MigrateAsync();
        return Results.Ok("Database migrated");
      }).AllowAnonymous();

      api.MapGet("seed-all", async (AppDbContext db) =>
      {
        var users = await CsvHelper.ReadFile("public_users_export_2025-02-17_115757", new UserMap());
        db.Users.AddRange(users);
        var scorings = await CsvHelper.ReadFile("scorings_rows", new ScoringMap());
        db.Scorings.AddRange(scorings);
        await db.SaveChangesAsync();

        _ = await db.Database.ExecuteSqlRawAsync("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));");

        var events = await CsvHelper.ReadFile("events_rows", new EventMap());
        db.Events.AddRange(events);
        await db.SaveChangesAsync();

        _ = await db.Database.ExecuteSqlRawAsync("SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));");


        var players = await CsvHelper.ReadFile("players_rows", new PlayerMap());
        db.Players.AddRange(players);
        await db.SaveChangesAsync();
        var trackLogs = await CsvHelper.ReadFile("public_track_logs_export_2025-02-16_183559", new TrackLogMap());
        db.TrackLogs.AddRange(trackLogs);
        await db.SaveChangesAsync();
        var trackHunts = await CsvHelper.ReadFile("public_track_hunts_export_2025-02-17_115429", new TrackHuntMap());
        db.TrackHunts.AddRange(trackHunts);
        await db.SaveChangesAsync();
        var hunts = await CsvHelper.ReadFile("hunts_rows", new HuntMap());
        db.Hunts.AddRange(hunts);
        await db.SaveChangesAsync();
        var huntsPlayers = await CsvHelper.ReadFile("public_hunts_player_export_2025-02-16_185058", new HuntsPlayerMap());
        db.HuntsPlayers.AddRange(huntsPlayers);
        await db.SaveChangesAsync();
        return Results.Ok("Database seeded");
      }).AllowAnonymous();

      api.MapPost("seed-user", async (SeedUserReq req, AppDbContext db) =>
      {
        var user = db.Users.SingleOrDefault(u => u.DiscordId == req.DiscordId);
        if (user != null)
        {
          return TypedResults.Ok(new { id = user.Id });
        }

        user = new User
        {
          Username = req.Username,
          Email = req.Email,
          DiscordId = req.DiscordId,
          AvatarUrl = req.AvatarUrl,
          CreatedAt = DateTime.UtcNow,
          UpdatedAt = DateTime.UtcNow,
          LastLoginAt = DateTime.UtcNow,
          IsActive = true,
          SteamId = req.SteamId ?? "",
          AltName = req.AltName ?? "",
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return TypedResults.Ok(new { id = user.Id });
      }).AllowAnonymous();

    }
  }

  public record SeedUserReq(string Username, string Email, string DiscordId, string AvatarUrl, string? SteamId, string? AltName);

  public class UserAlts
  {
    public string Username { get; set; } = "";
    public string DiscordId { get; set; } = "";
    public string SteamId { get; set; } = "";
    public string AltName { get; set; } = "";
  }
}