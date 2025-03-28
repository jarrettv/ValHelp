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
    api.MapGet("{userId:int}/current-event", GetCurrentEventId);
    api.MapGet("{userId:int}/score", RedirectToPlayerScore);
    api.MapGet("{userId:int}", GetPlayer);

    app.MapGet("api/obs/{view}/{userId}", RedirectObsView);
  }


    public record PlayerResponse(int UserId, string Username, string AvatarUrl, string Youtube, string Twitch, PlayerEventRow[] Events);
  public record PlayerEventRow(int EventId, string EventName, string PlayerName, string Stream, DateTime StartAt, DateTime EndAt, int PlayerStatus, int EventStatus, string Mode, string ScoringCode, float Hours, string Seed, int[] Scores, int Score, PlayerLogRow[] Logs);

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

  public static async Task<Results<NotFound, Ok<int>>> GetCurrentEventId(int userId, AppDbContext db, CancellationToken cancel)
  {
    var eventId = await LookupCurrentEventId(userId, db, cancel);

    if (eventId == 0)
    {
      return TypedResults.NotFound();
    }

    return TypedResults.Ok(eventId);
  }

  private static  async Task<Results<RedirectHttpResult, NotFound>> RedirectToPlayerScore(HttpContext ctx, int userId, AppDbContext db, CancellationToken cancel)
  {
    return await RedirectObsView(ctx, userId, "score", db, cancel);
  }

  private static async Task<int> LookupCurrentEventId(int userId, AppDbContext db, CancellationToken cancel)
  {
    var eventIds = await db.Events
      .Where(e => e.Status == EventStatus.New || e.Status == EventStatus.Live || e.Status == EventStatus.Over)
      .Where(e => e.Players.Any(p => p.UserId == userId))
      .Select(e => new { e.Status, e.StartAt, e.Id })
      .ToArrayAsync(cancel);

    if (eventIds.Length == 0)
    {
      return 0;
    }

    if (eventIds.Length == 1)
    {
      return eventIds[0].Id;
    }

    if (eventIds.Count(x => x.Status == EventStatus.Live) == 1)
    {
      var onlyLiveEventId = eventIds.First(x => x.Status == EventStatus.Live).Id;
      return onlyLiveEventId;
    }

    if (eventIds.Count(x => x.Status == EventStatus.New) == 1)
    {
      var onlyNewEventId = eventIds.First(x => x.Status == EventStatus.New).Id;
      return onlyNewEventId;
    }

    // otherwise redirect to the one with the closest start time
    var eventId = eventIds.OrderBy(x => Math.Abs((x.StartAt - DateTime.UtcNow).TotalSeconds)).First().Id;
    return eventId;
  }

  public static async Task<Results<RedirectHttpResult, NotFound>> RedirectObsView(HttpContext ctx, int userId, string view, AppDbContext db, CancellationToken cancel)
  {
    var eventId = await LookupCurrentEventId(userId, db, cancel);

    if (eventId == 0)
    {
      return TypedResults.NotFound();
    }

    return RedirectWithQuery(ctx, eventId, view, userId);
  }

  private static RedirectHttpResult RedirectWithQuery(HttpContext ctx, int eventId, string view, int userId)
  {
    var query = ctx.Request.Query;
    if (query.Count > 0)
    {
      var queryString = string.Join("&", query.Select(q => $"{q.Key}={q.Value}"));
      return TypedResults.Redirect($"/events/{eventId}/{view}/{userId}?{queryString.Replace("#", "%23")}");
    }
    return TypedResults.Redirect($"/events/{eventId}/{view}/{userId}");
  }
}
