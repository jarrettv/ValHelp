using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using static ValHelpApi.ModuleEvents.EventsEndpointsEvent;

namespace ValHelpApi.ModuleEvents;

public static class EventsEndpointsPlayer
{

    public static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/players");
        api.MapGet("{userId:int}/current-event", GetCurrentEventId);
        api.MapGet("{userId:int}/score", RedirectToPlayerScore);
        api.MapGet("{userId:int}", GetPlayer);

        app.MapGet("api/obs/lookup/{code}", GetObsLookup);
        app.MapGet("api/obs/{view}/{userId}", RedirectObsView);
    }

    public record ObsLookup(int UserId, int EventId);

    public static async Task<Results<NotFound, Ok<ObsLookup>>> GetObsLookup(string code, AppDbContext db, CancellationToken cancel)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length < 8 || code == "CHANGEME")
        {
            return TypedResults.NotFound();
        }

        var userId = await db.Users
            .AsNoTracking()
            .Where(u => u.ObsSecretCode == code)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancel);

        if (userId == 0) return TypedResults.NotFound();

        var eventId = await LookupCurrentEventId(userId, db, cancel);
        return TypedResults.Ok(new ObsLookup(userId, eventId));
    }

    public record PlayerResponse(int UserId, string Username, string AvatarUrl, string Youtube, string Twitch, PlayerEventRow[] Events);
    public record PlayerEventRow(int EventId, string EventName, string PlayerName, string Stream, DateTime StartAt, DateTime EndAt, int PlayerStatus, int EventStatus, string Mode, string ScoringCode, float Hours, bool IsPrivate, string Seed, int[] Scores, int Score, PlayerLogRow[] Logs);

    public static async Task<Results<NotFound, Ok<PlayerResponse>>> GetPlayer(int userId, AppDbContext db, ClaimsPrincipal cp)
    {
        var currentUserId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
        var includePrivate = currentUserId == userId;

        var userRow = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.Id, u.Username, u.AvatarUrl, u.Youtube, u.Twitch })
            .SingleOrDefaultAsync();

        if (userRow == null)
        {
            return TypedResults.NotFound();
        }

        // Load the player's event participation rows (includes logs), without also joining in all event players.
        var playerEvents = await db.Players
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Where(p => includePrivate || !p.Event.IsPrivate)
            .Select(p => new
            {
                p.EventId,
                EventName = p.Event.Name,
                PlayerName = p.Name,
                p.Stream,
                p.Event.StartAt,
                p.Event.EndAt,
                PlayerStatus = (int)p.Status,
                EventStatus = (int)p.Event.Status,
                p.Event.Mode,
                p.Event.ScoringCode,
                p.Event.Hours,
                p.Event.IsPrivate,
                p.Event.Seed,
                p.Score,
                Logs = p.Logs.Select(l => new PlayerLogRow(l.Code, l.At, l.X ?? 0, l.Y ?? 0, l.Z ?? 0)).ToArray()
            })
            .ToArrayAsync();

        var eventIds = playerEvents.Select(e => e.EventId).Distinct().ToArray();

        // Fetch scores per event as a separate query to avoid multiplying rows when also reading logs.
        var scoresByEvent = await db.Players
            .AsNoTracking()
            .Where(p => eventIds.Contains(p.EventId))
            .GroupBy(p => p.EventId)
            .Select(g => new
            {
                EventId = g.Key,
                Scores = g.OrderBy(x => x.UserId).Select(x => x.Score).ToArray()
            })
            .ToDictionaryAsync(x => x.EventId, x => x.Scores);

        var resp = new PlayerResponse(
            userRow.Id,
            userRow.Username,
            userRow.AvatarUrl,
            userRow.Youtube,
            userRow.Twitch,
            playerEvents.Select(e => new PlayerEventRow(
                e.EventId,
                e.EventName,
                e.PlayerName,
                e.Stream,
                e.StartAt,
                e.EndAt,
                e.PlayerStatus,
                e.EventStatus,
                e.Mode,
                e.ScoringCode,
                e.Hours,
                e.IsPrivate,
                e.Seed,
                scoresByEvent.TryGetValue(e.EventId, out var scores) ? scores : [],
                e.Score,
                e.Logs
            )).ToArray()
        );

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

    private static async Task<Results<RedirectHttpResult, NotFound>> RedirectToPlayerScore(HttpContext ctx, int userId, AppDbContext db, CancellationToken cancel)
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
