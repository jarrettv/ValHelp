using System.Data.Common;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public static class ImportEndpoints
{

  public static void MapImportEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/import");

    if (app.Environment.IsDevelopment())
    {
      api.MapPost("", PostImport).AllowAnonymous();
    }
  }

  public record ImportRequest(int[] HuntIds);
  public record ImportResponse(DateTime At);

  public static async Task<Results<BadRequest, Ok<ImportResponse>>> PostImport(ImportRequest req, ClaimsPrincipal user,
    AppDbContext db, ILoggerFactory logger)
  {
    var log = logger.CreateLogger("Import");

    var users = await db.Users
      .AsNoTracking()
      .Select(x => new { x.Id, x.Username, x.AvatarUrl, x.DiscordId, x.SteamId, x.AltName })
      .ToArrayAsync();

    var hunts = await db.Hunts
      .AsNoTracking()
      .Include(h => h.Players)
      .Where(h => req.HuntIds.Contains(h.Id))
      .ToArrayAsync();

    foreach (var hunt in hunts)
    {
      var trackLogs = await db.TrackHunts
        .AsNoTracking()
        .Where(x => x.SessionId == hunt.Seed)
        .OrderBy(x => x.CreatedAt)
        .ToArrayAsync();

      log.LogInformation("Importing hunt {huntId} found logs {logs}", hunt.Id, trackLogs.Length);

      var now = DateTime.UtcNow;
      var ev = new Event
      {
        Name = hunt.Name,
        StartAt = hunt.StartAt,
        EndAt = hunt.EndAt,
        Status = (EventStatus)hunt.Status,
        Mode = hunt.Name.Contains("Saga") ? "TrophySaga" : hunt.Name.Contains("Rush") ? "TrophyRush" : "TrophyHunt",
        ScoringCode = hunt.Name.Contains("Saga") ? "saga-2024-12" : hunt.Name.Contains("Rush") ? "rush-2024-11" : "hunt-2024-11",
        Hours = (float)(hunt.EndAt - hunt.StartAt).TotalHours,
        Desc = hunt.Desc,
        Seed = hunt.Seed,
        Prizes = hunt.Prizes,
        CreatedAt = now,
        CreatedBy = hunt.CreatedBy,
        UpdatedAt = now,
        UpdatedBy = hunt.UpdatedBy,
      };

      foreach (var player in hunt.Players)
      {
        var u = users
          .Where(x => new[] { x.Username, x.DiscordId, x.SteamId, x.AltName }
            .Any(id => id!.ToLower() == player.Name.ToLower()))
          .SingleOrDefault();

        if (u == null)
        {
          log.LogWarning("User {name} not found for hunt {hunt}", player.Name, hunt.Name);
          continue;
        }

        var p = new Player
        {
          EventId = ev.Id,
          UserId = u.Id,
          Name = player.Name,
          AvatarUrl = u.AvatarUrl,
          Stream = player.Stream,
          Status = (PlayerStatus)player.Status,
        };

        var userLogs = trackLogs
          .Where(x => x.PlayerId == player.PlayerId)
          .OrderBy(x => x.CreatedAt)
          .ToList();

        foreach (var ul in userLogs)
        {
          p.Update(ul.CreatedAt, ul.CurrentScore, ul.Trophies, ul.Deaths, ul.Logouts);
        }

        p.Update(player.UpdatedAt, player.Score, player.Trophies, player.Deaths, player.Relogs);
        ev.Players.Add(p);
      }

      db.Events.Add(ev);
      log.LogInformation("Event {eventId} added", ev.Id);
    }

    try
    {
      await db.SaveChangesAsync();
    }
    catch (DbUpdateException ex)
    {
      log.LogError(ex, "Save changes failed");
      return TypedResults.BadRequest();
    }

    return TypedResults.Ok(new ImportResponse(DateTime.UtcNow));
  }
}