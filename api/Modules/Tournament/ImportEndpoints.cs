using System.Collections.Immutable;
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

    api.MapGet("", GetImport).RequireAuthorization("Admin");
  }

  public record ImportRequest(int[] HuntIds);
  public record ImportResponse(DateTime At, string[] Logs);

  public static async Task<Results<BadRequest, Ok<ImportResponse>>> GetImport(ClaimsPrincipal user,
    AppDbContext db, ILoggerFactory logger)
  {
    var log = logger.CreateLogger("Import");

    var logs = new List<string>();
    var huntIds = new[] {2,4,5,6,7,12,13,14,16,17,18,20,21,22,24};
    //var huntIds = new [] { 12 };
    var users = await db.Users
      .AsNoTracking()
      .Select(x => new { x.Id, x.Username, x.AvatarUrl, x.DiscordId, x.SteamId, x.AltName })
      .ToArrayAsync();

    var hunts = await db.Hunts
      .AsNoTracking()
      .Include(h => h.Players)
      .Where(h => huntIds.Contains(h.Id))
      .ToArrayAsync();

    foreach (var hunt in hunts)
    {
      var trackLogs = await db.TrackHunts
        .AsNoTracking()
        .Where(x => x.SessionId == hunt.Seed)
        .ToArrayAsync();

      log.LogInformation("Importing hunt {huntId} found logs {logs}", hunt.Id, trackLogs.Length);
      logs.Add($"Importing hunt {hunt.Id} found logs {trackLogs.Length}");

      var now = DateTime.UtcNow;
      var ev = new Event
      {
        Name = hunt.Name.Replace(" Tournament", ""),
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
          logs.Add($"User {player.Name} not found for hunt {hunt.Name}");
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
          .Where(x => x.PlayerName == player.PlayerId)
          .OrderBy(x => x.CreatedAt)
          .ToImmutableArray();

        logs.Add($"Importing player {player.Name} found logs {userLogs.Length}");

        foreach (var ul in userLogs)
        {
          //if CreateAt is outside of the event start/end, skip
          if (ul.CreatedAt < ev.StartAt || ul.CreatedAt > ev.EndAt)
          {
            logs.Add($"Log {ul.Id} outside of event {ev.Id} start/end");
            log.LogWarning("Log {logId} outside of event {eventId} start/end", ul.Id, ev.Id);
            continue;
          }
          p.Update(ul.CreatedAt, ul.CurrentScore, ul.Trophies.Split(','), ul.Deaths, ul.Logouts);
        }

        if (userLogs.Length > 0 && p.Score != player.Score)
        {
          logs.Add($"Player {player.Name} score mismatch {p.Score} != {player.Score}");
          log.LogWarning("Player {name} score mismatch {score} != {playerScore}", player.Name, p.Score, player.Score);
        }

        p.Update(player.UpdatedAt, player.Score, player.Trophies, player.Deaths, player.Relogs);
        ev.Players.Add(p);
      }

      db.Events.Add(ev);
      log.LogInformation("Event added for hunt {hunt}", hunt.Id);
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

    return TypedResults.Ok(new ImportResponse(DateTime.UtcNow, logs.ToArray()));
  }
}