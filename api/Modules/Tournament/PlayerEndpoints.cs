using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using static ValHelpApi.Modules.Tournament.EventEndpoints;

namespace ValHelpApi.Modules.Tournament;

public static class PlayerEndpoints
{

  public static void MapPlayerEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/players");

    api.MapGet("{userId}/score", GetPlayerScore);
    api.MapGet("{userId}", GetPlayer);
  }

  public record PlayerResponse(int UserId, string Username, string AvatarUrl, string Youtube, string Twitch, PlayerEventRow[] Events);
  public record PlayerEventRow(int EventId, string EventName, string PlayerName, string Stream, DateTime StartAt, DateTime EndAt,int PlayerStatus,  int EventStatus, string Mode, string ScoringCode, float Hours, string Seed, int[] Scores, int Score, PlayerLogRow[] Logs);

  public static async Task<Results<NotFound, Ok<PlayerResponse>>> GetPlayer(int userId, AppDbContext db)
  {
    var resp = await db.Users
      .AsNoTracking()
      .Where(u => u.Id == userId)
      .Select(x => new PlayerResponse(x.Id, x.Username, x.AvatarUrl, x.Youtube, x.Twitch, 
        x.Players.Select(p => new PlayerEventRow(p.EventId, p.Event.Name, p.Name, p.Stream, p.Event.StartAt, p.Event.EndAt, (int)p.Event.Status, (int)p.Status, p.Event.Mode, p.Event.ScoringCode, p.Event.Hours, p.Event.Seed, 
        p.Event.Players.Select(x => x.Score).ToArray(), p.Score, 
          p.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray())).ToArray()))
      .SingleOrDefaultAsync();

    if (resp == null)
    {
      return TypedResults.NotFound();
    }

    return TypedResults.Ok(resp);
  }
  
  public static async Task<Results<RedirectHttpResult, NotFound>> GetPlayerScore(HttpContext ctx, int userId, AppDbContext db, CancellationToken cancel)
  {
    var eventId = await db.Events
      .Where(e => e.Status >= EventStatus.New && e.Status <= EventStatus.Live)
      .Where(e => e.Players.Any(p => p.UserId == userId))
      .OrderByDescending(e => e.StartAt)
      .Select(e => e.Id)
      .FirstOrDefaultAsync(cancel);

    if (eventId == 0)
    {
      return TypedResults.NotFound();
    }

    var query = ctx.Request.Query;
    if (query.Count > 0)
    {
      var queryString = string.Join("&", query.Select(q => $"{q.Key}={q.Value}"));
      return TypedResults.Redirect($"/events/{eventId}/score/{userId}?{queryString}");
    }
    return TypedResults.Redirect($"/events/{eventId}/score/{userId}");
  }
}
