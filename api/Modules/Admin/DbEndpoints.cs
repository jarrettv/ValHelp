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

      api.MapGet("seed-users", async (AppDbContext db) =>
      {
        var users = await CsvHelper.ReadFile("users", new UserMap());
        db.Users.AddRange(users);
        await db.SaveChangesAsync();
        return Results.Ok("Users seeded");
      }).AllowAnonymous();

      api.MapGet("seed-scorings", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("scorings", new ScoringMap());
        db.Scorings.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Scorings seeded");
      }).AllowAnonymous();

      api.MapGet("seed-events", async (AppDbContext db) =>
      {
        var events = await CsvHelper.ReadFile("events", new EventMap());
        db.Events.AddRange(events);
        await db.SaveChangesAsync();
        return Results.Ok("Events seeded");
      }).AllowAnonymous();

      api.MapGet("seed-players", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("players", new PlayerMap());
        db.Players.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Players seeded");
      }).AllowAnonymous();

      api.MapGet("seed-tracklogs", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("track_logs", new TrackLogMap());
        db.TrackLogs.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Track logs seeded");
      }).AllowAnonymous();

      api.MapGet("seed-trackhunts", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("track_hunts", new TrackHuntMap());
        db.TrackHunts.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Track hunts seeded");
      }).AllowAnonymous();

      api.MapGet("seed-hunts", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("hunts", new HuntMap());
        db.Hunts.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Hunts seeded");
      }).AllowAnonymous();

      api.MapGet("seed-huntsplayers", async (AppDbContext db) =>
      {
        var rows = await CsvHelper.ReadFile("hunts_player", new HuntsPlayerMap());
        db.HuntsPlayers.AddRange(rows);
        await db.SaveChangesAsync();
        return Results.Ok("Hunts players seeded");
      }).AllowAnonymous();

      api.MapPost("seed-user", async (SeedUserReq req, AppDbContext db) =>
      {
        var user = db.Users.SingleOrDefault(u => u.DiscordId == req.DiscordId);
        if (user != null)
        {
          return TypedResults.Conflict(new { id = user.Id });
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
      }).AllowAnonymous();//.RequireAuthorization("Admin");

    }
  }

  public record SeedUserReq(string Username, string Email, string DiscordId, string AvatarUrl, string? SteamId, string? AltName);
}