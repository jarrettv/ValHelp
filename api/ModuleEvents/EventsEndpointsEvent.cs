using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleEvents;

public static class EventsEndpointsEvent
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/events");

        api.MapPost("", PostEvent).RequireAuthorization();
        api.MapGet("0", GetEventEdit);
        api.MapGet("latest", GetEventsLatest);
        api.MapGet("upcoming", GetEventsUpcoming);
        api.MapGet("current", GetEventCurrent);
        api.MapGet("private", GetMyPrivateEvents).RequireAuthorization();
        api.MapGet("private/{password}", GetPrivateEventByPassword);
        api.MapGet("{id:int}", GetEvent).WithName("GetEvent");
        api.MapDelete("{id:int}", DeleteEvent).RequireAuthorization();
        api.MapPost("{id:int}/players", PostPlayer).RequireAuthorization();
        api.MapGet("{id:int}/players", GetPlayers);
        api.MapGet("", GetEvents);
    }

    public record EventRow(int Id, string Name, DateTime StartAt, DateTime EndAt, EventStatus Status, EventRowPlayer[] Players, string Mode, float Hours, string CreatedBy, bool IsPrivate, int OwnerId);
    public record EventRowPlayer(int Id, string Name, string AvatarUrl, int Score);
    public record EventsResponse(EventRow[] Data, int Total);
    public static async Task<Ok<EventsResponse>> GetEvents(AppDbContext db, ClaimsPrincipal cp)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

        var hunts = await db.Events
          .Where(h => h.Status > EventStatus.Draft && h.Status < EventStatus.Deleted)
          .Where(h => !h.IsPrivate || h.OwnerId == userId || h.Players.Any(p => p.UserId == userId))
          .Select(h => new EventRow(
            h.Id,
            h.Name,
            h.StartAt,
            h.EndAt,
            h.Status,
            h.Players.Where(x => x.Status >= 0).Select(hp => new EventRowPlayer(hp.UserId, hp.Name, hp.AvatarUrl, hp.Score)).ToArray(),
            h.Mode,
            h.Hours,
            h.CreatedBy,
            h.IsPrivate,
            h.OwnerId
          ))
          .ToArrayAsync();

        return TypedResults.Ok(new EventsResponse(hunts, hunts.Length));
    }

    public static async Task<Ok<EventsResponse>> GetEventsLatest(AppDbContext db, ClaimsPrincipal cp)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

        var rows = await db.Events
          .Where(h => h.Status == EventStatus.Live || h.Status == EventStatus.Over)
          .Where(h => !h.IsPrivate || h.OwnerId == userId || h.Players.Any(p => p.UserId == userId))
          .Select(h => new
          {
              h.Id,
              h.Name,
              h.StartAt,
              h.EndAt,
              h.Status,
              Players = h.Players.Where(x => x.Status >= 0).Select(hp => new { hp.UserId, hp.Name, hp.AvatarUrl, hp.Score })
            ,
              h.Mode,
              h.Hours,
              h.CreatedBy,
              h.IsPrivate,
              h.OwnerId
          })
          .OrderBy(x => x.Status)
          .ThenByDescending(x => x.StartAt)
          .Take(2)
          .ToArrayAsync();

        return TypedResults.Ok(new EventsResponse(rows.Select(x => new EventRow(
          x.Id,
          x.Name,
          x.StartAt,
          x.EndAt,
          x.Status,
          x.Players.Select(p => new EventRowPlayer(p.UserId, p.Name, p.AvatarUrl, p.Score)).ToArray()
          ,
          x.Mode,
          x.Hours,
          x.CreatedBy,
          x.IsPrivate,
          x.OwnerId
        )).ToArray(), rows.Length));
    }

    public static async Task<Ok<EventsResponse>> GetEventsUpcoming(AppDbContext db, ClaimsPrincipal cp)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

        var rows = await db.Events
          .Where(h => h.Status == EventStatus.New)
          .Where(h => !h.IsPrivate || h.OwnerId == userId || h.Players.Any(p => p.UserId == userId))
          .Select(h => new
          {
              h.Id,
              h.Name,
              h.StartAt,
              h.EndAt,
              h.Status,
              Players = h.Players.Where(x => x.Status >= 0).Select(hp => new { hp.UserId, hp.Name, hp.AvatarUrl, hp.Score })
            ,
              h.Mode,
              h.Hours,
              h.CreatedBy,
              h.IsPrivate,
              h.OwnerId
          })
          .OrderByDescending(x => x.StartAt)
          .Take(4)
          .ToArrayAsync();


        return TypedResults.Ok(new EventsResponse(rows.Select(x => new EventRow(
          x.Id,
          x.Name,
          x.StartAt,
          x.EndAt,
          x.Status,
          x.Players.Select(p => new EventRowPlayer(p.UserId, p.Name, p.AvatarUrl, p.Score)).ToArray(),
          x.Mode,
          x.Hours,
          x.CreatedBy,
          x.IsPrivate,
          x.OwnerId
        )).ToArray(), rows.Length));
    }

    private record CurrentEvent(int Id);

    private static async Task<Results<NotFound, Ok<CurrentEvent>>> GetEventCurrent(string mode, AppDbContext db, CancellationToken cancel)
    {

        var currentEventId = await LookupCurrentEventId(mode, db, cancel);
        if (currentEventId == 0)
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(new CurrentEvent(currentEventId));
    }

    public static async Task<Ok<EventsResponse>> GetMyPrivateEvents(AppDbContext db, ClaimsPrincipal cp)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

        var rows = await db.Events
          .Where(h => h.Status < EventStatus.Deleted)
          .Where(h => h.IsPrivate && (h.OwnerId == userId || h.Players.Any(p => p.UserId == userId)))
          .Select(h => new
          {
              h.Id,
              h.Name,
              h.StartAt,
              h.EndAt,
              h.Status,
              Players = h.Players.Where(x => x.Status >= 0).Select(hp => new { hp.UserId, hp.Name, hp.AvatarUrl, hp.Score })
            ,
              h.Mode,
              h.Hours,
              h.CreatedBy,
              h.OwnerId
          })
          .OrderByDescending(x => x.StartAt)
          .ToArrayAsync();

        return TypedResults.Ok(new EventsResponse(rows.Select(x => new EventRow(
          x.Id,
          x.Name,
          x.StartAt,
          x.EndAt,
          x.Status,
          x.Players.Select(p => new EventRowPlayer(p.UserId, p.Name, p.AvatarUrl, p.Score)).ToArray()
          , x.CreatedBy,
          x.Hours,
          x.Mode,
          true,
          x.OwnerId
        )).ToArray(), rows.Length));
    }

    public static async Task<Results<NotFound, Ok<EventDetails>>> GetPrivateEventByPassword(string password, AppDbContext db, HybridCache cache, CancellationToken token)
    {
        var hunt = await db.Events
          .AsNoTracking()
          .Where(h => h.IsPrivate && h.PrivatePassword == password && h.Status < EventStatus.Deleted)
          .Select(h => new EventDetails(
            h.Id,
            h.Name,
            h.Desc,
            h.Mode,
            h.ScoringCode,
            h.Scoring.Scores,
            h.StartAt,
            h.EndAt,
            h.Hours,
            h.Seed,
            (int)h.Status,
            h.CreatedBy,
            h.UpdatedBy,
            h.UpdatedAt,
            h.Players.Select(hp => new EventPlayersRow(
            hp.UserId,
            hp.Name,
            hp.AvatarUrl,
            hp.Status,
            hp.Score,
            hp.Stream,
            hp.UpdatedAt,
            hp.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray()
          )).ToArray(),
            h.IsPrivate,
            h.OwnerId,
            h.PrivatePassword
        )).FirstOrDefaultAsync(token);

        if (hunt == null)
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(hunt);
    }

    public static async Task<Results<UnauthorizedHttpResult, Ok<EventDetails>>> GetEventEdit(ClaimsPrincipal user, AppDbContext db)
    {
        if (!user.Identity?.IsAuthenticated ?? false)
        {
            await Task.Delay(300);
            return TypedResults.Unauthorized();
        }

        // TODO: get defaults from database

        var nextSaturday = DateTime.Today.AddDays(6 - (int)DateTime.UtcNow.DayOfWeek + 7).AddHours(14);
        var defaultDesc = """
Best score wins! New game, fresh character, seed will be chosen 5 minutes before the event begins

HOW TO BEGIN:
» Create a new character
» Have the seed created and ready by :00 on the hour
» Start the world at :00 (don't preload the world)

RULES:
» Using Valheim seed finder is not allowed
» No stream sniping other competitors
» No clipping
» No console commands
» Using /printseeds is banned (except in Saga mode)
» Using /die is allowed (however -20 points)
» No emote animation cancelling

If PC crashes, you may relog in and continue just make sure to immediately restart stream

MUST BE STREAMING (Visible gameplay + audio is required)
Preferred Youtube/Twitch as livestreaming service.
Please turn on past broadcasting on twitch so we can review video if needed.

Point system (All trophies only count once) example: 37 deer trophies = 10 points
""";

        var resp = new EventDetails(0, "", defaultDesc, "TrophyHunt", "hunt-2025-09", new Dictionary<string, int>(), nextSaturday, nextSaturday.AddHours(4), 4, "(random)", 0, user.Identity?.Name ?? "Unknown", user.Identity?.Name ?? "Unknown", DateTime.UtcNow, Array.Empty<EventPlayersRow>(), false, 1, null);
        return TypedResults.Ok(resp);
    }

    public record EventDetails(int Id, string Name, string Desc, string Mode, string ScoringCode, Dictionary<string, int> Scoring, DateTime StartAt, DateTime EndAt, float Hours,
      string Seed, int Status, string CreatedBy, string UpdatedBy, DateTime UpdatedAt, EventPlayersRow[] Players, bool IsPrivate, int OwnerId, string? PrivatePassword);
    public static async Task<Results<StatusCodeHttpResult, NotFound, Ok<EventDetails>>> GetEvent(int id, AppDbContext db, HttpContext ctx,
      ClaimsPrincipal cp, HybridCache cache, CancellationToken token)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

        var hunt = await cache.GetOrCreateAsync($"event-{id}", async cancel => await GetEventFromDatabase(id, db, cancel), cancellationToken: token);

        if (hunt == null)
        {
            return TypedResults.NotFound();
        }

        if (!CanAccessEvent(hunt, userId, ctx))
        {
            return TypedResults.NotFound();
        }

        var etag = ctx.Request.Headers.IfNoneMatch.FirstOrDefault();
        DateTime? updatedAt = null;
        if (!string.IsNullOrWhiteSpace(etag))
        {
            updatedAt = DateTime.Parse(etag, null, System.Globalization.DateTimeStyles.RoundtripKind);
        }

        var maxPlayerUpdatedAt = hunt.Players.Max(p => p.UpdatedAt);
        var maxUpdatedAt = hunt.UpdatedAt > maxPlayerUpdatedAt ? hunt.UpdatedAt : maxPlayerUpdatedAt;
        if (updatedAt != null && maxUpdatedAt == updatedAt)
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        ctx.Response.Headers.ETag = maxUpdatedAt.ToString("O");
        return TypedResults.Ok(hunt);
    }

    private static async Task<EventDetails?> GetEventFromDatabase(int id, AppDbContext db, CancellationToken token)
    {
        return await db.Events
          .AsNoTracking()
          .Where(h => h.Id == id)
          //.Where(h => updatedAt == null || h.UpdatedAt > updatedAt)
          .Where(h => h.Status < EventStatus.Deleted)
          .Select(h => new EventDetails(
            h.Id,
            h.Name,
            h.Desc,
            h.Mode,
            h.ScoringCode,
            h.Scoring.Scores,
            h.StartAt,
            h.EndAt,
            h.Hours,
            h.Seed,
            (int)h.Status,
            h.CreatedBy,
            h.UpdatedBy,
            h.UpdatedAt,
            h.Players.Select(hp => new EventPlayersRow(
            hp.UserId,
            hp.Name,
            hp.AvatarUrl,
            hp.Status,
            hp.Score,
            hp.Stream,
            hp.UpdatedAt,
            hp.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray()
          )).ToArray(),
            h.IsPrivate,
            h.OwnerId,
            h.PrivatePassword
        )).FirstOrDefaultAsync(token);
    }

    public record EventRequest(int Id, string Name, string Desc, string Mode, string ScoringCode, DateTime StartAt, int Hours, string Seed, int Status, bool IsPrivate);
    public record EventResponse(int Id);

    public static async Task<Results<NotFound, UnauthorizedHttpResult, ValidationProblem, Ok<EventResponse>, CreatedAtRoute<EventResponse>>>
      PostEvent(EventRequest req, AppDbContext db, ClaimsPrincipal cp, HybridCache cache)
    {
        var scoring = await db.Scorings
          .Where(s => s.IsActive)
          .Where(s => s.Code == req.ScoringCode)
          .FirstOrDefaultAsync();

        if (scoring == null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
      {
        { "scoringCode", new[] { "Please choose a valid scoring mechanism" } }
      }, title: "Please choose a valid scoring mechanism");
        }
        else if (!scoring.Modes.Any(x => x == req.Mode))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
      {
        { "mode", new[] { "Mode must match the chosen scoring" } }
      }, title: "Mode must match the chosen scoring");
        }

        if (req.Name.Length < 5 || req.Name.Length > 26)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
      {
        { "name", new[] { "Name must be between 5 and 26 characters" } }
      }, title: "Name must be between 5 and 26 characters");
        }


        // TODO: Validate more of the request

        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await db.Users.FindAsync(userId);

        Event? hunt = null;
        var now = DateTime.UtcNow;
        if (req.Id > 0)
        {
            hunt = await db.Events
              .Include(x => x.Players)
              .FirstOrDefaultAsync(h => h.Id == req.Id);
            if (hunt == null)
            {
                return TypedResults.NotFound();
            }
            var authorized = userId == 1 || cp.IsInRole("admin") ||
              hunt.Players.Any(x => x.UserId == userId && (x.Status == PlayerStatus.OwnerIn || x.Status == PlayerStatus.OwnerOut));
            if (!authorized)
            {
                return TypedResults.Unauthorized();
            }
        }
        else
        {
            hunt = new Event();
            hunt.CreatedAt = now;
            hunt.CreatedBy = user!.Username;
            hunt.Players = [new Player { UserId = userId, Name = user.Username, AvatarUrl = user.AvatarUrl,
        Status = PlayerStatus.OwnerIn, Stream = user.Youtube ?? user.Twitch ?? "N/A", UpdatedAt = now }];
            db.Events.Add(hunt);
        }

        hunt.Name = req.Name.Trim();
        hunt.StartAt = req.StartAt;
        hunt.EndAt = req.StartAt.AddHours(req.Hours);
        hunt.Status = (EventStatus)req.Status;
        hunt.Mode = req.Mode;
        hunt.ScoringCode = req.ScoringCode;
        hunt.Hours = req.Hours;
        hunt.Desc = req.Desc;
        hunt.Seed = req.Seed;
        hunt.IsPrivate = req.IsPrivate;
        hunt.OwnerId = userId;

        // Generate password for private events
        if (req.IsPrivate && string.IsNullOrEmpty(hunt.PrivatePassword))
        {
            hunt.PrivatePassword = GeneratePrivatePassword();
        }

        hunt.Prizes = new Dictionary<string, string>() { { "1st", "(unknown)" } };
        hunt.UpdatedAt = now;
        hunt.UpdatedBy = user!.Username;
        await db.SaveChangesAsync();
        await cache.RemoveAsync($"event-{hunt.Id}");

        var resp = new EventResponse(hunt.Id);
        if (hunt.CreatedAt == now)
        {
            return TypedResults.CreatedAtRoute(resp, "GetEvent", new { id = hunt.Id });
        }
        else
        {
            return TypedResults.Ok(resp);
        }
    }

    private static string GeneratePrivatePassword()
    {
        // Same algorithm as SeedMaker but without the abbr
        const string chars = "ABCDEFGHJKLMNPQRTUVWXYZ23456789";
        var random = new Random();
        return new string(Enumerable.Repeat(chars, 6)
          .Select(s => s[random.Next(s.Length)]).ToArray());
    }

    public static async Task<Results<UnauthorizedHttpResult, ValidationProblem, Ok, NotFound>> DeleteEvent(int id, AppDbContext db, ClaimsPrincipal cp, HybridCache cache)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await db.Users.FindAsync(userId);

        var hunt = await db.Events
          .Include(x => x.Players)
          .FirstOrDefaultAsync(h => h.Id == id);
        if (hunt == null)
        {
            return TypedResults.NotFound();
        }

        var authorized = userId == 1 || cp.IsInRole("admin") ||
          hunt.Players.Any(x => x.UserId == userId && (x.Status == PlayerStatus.OwnerIn || x.Status == PlayerStatus.OwnerOut));
        if (!authorized)
        {
            return TypedResults.Unauthorized();
        }

        if (hunt.Status == EventStatus.Live)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
      {
        { "status", new[] { "Cannot delete a live event" } }
      }, title: "Cannot delete a live event");
        }

        hunt.Status = EventStatus.Deleted;
        hunt.UpdatedAt = DateTime.UtcNow;
        hunt.UpdatedBy = user!.Username;
        await db.SaveChangesAsync();
        await cache.RemoveAsync($"event-{hunt.Id}");

        return TypedResults.Ok();
    }

    public record PlayerLogRow(string Code, DateTime At);
    public record PlayerReq(int UserId, string Name, string Stream, string In, string Youtube, string Twitch, string Best);
    public record PlayerResp(int EventId, int UserId, string Name, string AvatarUrl, string Stream, int Score, PlayerLogRow[] logs, DateTime UpdatedAt);
    private static async Task<Results<Ok<PlayerResp>, ValidationProblem, UnauthorizedHttpResult, NotFound>> PostPlayer(int id, PlayerReq req, AppDbContext db, ClaimsPrincipal cp, HybridCache cache)
    {
        // TODO: Validate request
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var auth = userId == 1 || cp.IsInRole("Admin") || req.UserId == userId;
        if (!auth)
        {
            return TypedResults.Unauthorized();
        }

        var userInfo = await db.Users
          .Where(u => u.Id == req.UserId)
          .Select(u => new { u.Username, u.AvatarUrl, u.Youtube, u.Twitch })
          .SingleAsync();

        var player = await db.Players
          .Where(hp => hp.EventId == id)
          .Where(hp => hp.UserId == req.UserId)
          .FirstOrDefaultAsync();

        if (player == null)
        {
            player = new Player { EventId = id, UserId = req.UserId, AvatarUrl = userInfo.AvatarUrl };
            db.Players.Add(player);
        }

        player.Name = req.Name;
        player.Stream = req.Stream ?? player.Stream ?? "N/A";

        if (player.Status == PlayerStatus.OwnerIn || player.Status == PlayerStatus.OwnerOut)
        {
            player.Status = req.In == "on" ? PlayerStatus.OwnerIn : PlayerStatus.OwnerOut;
        }
        else
        {
            player.Status = req.In == "on" ? PlayerStatus.PlayerIn : PlayerStatus.PlayerOut;
        }

        var ytLog = player.Logs.FirstOrDefault(l => l.Code.StartsWith("ChannelYoutube"));
        if (ytLog != null)
        {
            player.Logs.Remove(ytLog);
        }

        if (req.Youtube == "on" && !string.IsNullOrWhiteSpace(userInfo.Youtube))
        {
            player.Logs.Add(new PlayerLog($"ChannelYoutube={userInfo.Youtube}", DateTime.UtcNow));
        }

        var twLog = player.Logs.FirstOrDefault(l => l.Code.StartsWith("ChannelTwitch"));
        if (twLog != null)
        {
            player.Logs.Remove(twLog);
        }

        if (req.Twitch == "on" && !string.IsNullOrWhiteSpace(userInfo.Twitch))
        {
            player.Logs.Add(new PlayerLog($"ChannelTwitch={userInfo.Twitch}", DateTime.UtcNow));
        }

        var bestLog = player.Logs.FirstOrDefault(l => l.Code.StartsWith("PersonalBest"));
        if (bestLog != null)
        {
            player.Logs.Remove(bestLog);
        }

        if (req.Best == "on")
        {
            var eventType = await db.Events
              .Where(h => h.Id == id)
              .Select(h => new { h.Mode, h.ScoringCode, h.Hours })
              .SingleAsync();

            var best = await db.Players
              .Where(hp => hp.UserId == req.UserId)
              .Where(hp => hp.Event.Mode == eventType.Mode)
              .Where(hp => hp.Event.ScoringCode == eventType.ScoringCode)
              .Where(hp => hp.Event.Hours == eventType.Hours)
              .Where(hp => hp.Status >= 0)
              .Select(hp => hp.Score)
              .MaxAsync();

            if (best > 0)
            {
                player.Logs.Add(new PlayerLog($"PersonalBest={best}", DateTime.UtcNow));
            }
        }

        player.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await cache.RemoveAsync($"event-{id}");

        var resp = new PlayerResp(id, req.UserId, player.Name, player.AvatarUrl, player.Stream, player.Score,
          player.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray(), player.UpdatedAt);
        return TypedResults.Ok(resp);
    }

    public record EventPlayersRow(int UserId, string Name, string AvatarUrl, PlayerStatus Status, int Score, string Stream, DateTime UpdatedAt, PlayerLogRow[] logs);
    private static async Task<Results<NotFound, Ok<EventPlayersRow[]>>> GetPlayers(int id, AppDbContext db)
    {
        var players = await db.Players
          .Where(hp => hp.EventId == id)
          .Select(hp => new EventPlayersRow(
            hp.UserId,
            hp.Name,
            hp.AvatarUrl,
            hp.Status,
            hp.Score,
            hp.Stream,
            hp.UpdatedAt,
            hp.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray()
          ))
          .ToArrayAsync();

        return TypedResults.Ok(players);
    }

    private static bool CanAccessEvent(EventDetails hunt, int userId, HttpContext ctx)
    {
        if (!hunt.IsPrivate)
        {
            return true;
        }

        if (hunt.OwnerId == userId)
        {
            return true;
        }

        if (hunt.Players.Any(p => p.UserId == userId))
        {
            return true;
        }

        var providedPassword = ctx.Request.Query["password"].FirstOrDefault() ??
                              ctx.Request.Headers["X-Private-Password"].FirstOrDefault();

        if (providedPassword == hunt.PrivatePassword)
        {
            return true;
        }

        return false;
    }


    private static async Task<int> LookupCurrentEventId(string eventMode, AppDbContext db, CancellationToken cancel)
    {
        var eventIds = await db.Events
          .Where(e => e.Status == EventStatus.New || e.Status == EventStatus.Live || e.Status == EventStatus.Over)
          .Where(e => e.Mode == eventMode)
          .Select(e => new { e.Status, e.StartAt, e.Id })
          .OrderByDescending(e => e.StartAt)
          .Take(10)
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
}
