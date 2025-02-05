using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public static class EventEndpoints
{
  public static void MapEventEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/events");

    api.MapPost("", PostEvent).RequireAuthorization();
    api.MapGet("host", GetEventEdit);
    api.MapGet("latest", GetEventsLatest);
    api.MapGet("upcoming", GetEventsUpcoming);
    api.MapGet("{id:int}", GetEvent).WithName("GetEvent");
    api.MapPost("{id:int}/players", PostPlayer).RequireAuthorization();
    api.MapGet("{id:int}/players", GetPlayers);
    api.MapGet("", GetEvents);
  }

  public record EventRow(int Id, string Name, DateTime StartAt, DateTime EndAt, EventStatus Status, EventRowPlayer[] Players);
  public record EventRowPlayer(int Id, string Name, string AvatarUrl, int Score);
  public record EventsResponse(EventRow[] Data, int Total);
  public static async Task<Ok<EventsResponse>> GetEvents(AppDbContext db)
  {
    var hunts = await db.Events
      .Where(h => h.Status < EventStatus.Deleted)
      .Select(h => new EventRow(
        h.Id,
        h.Name,
        h.StartAt,
        h.EndAt,
        h.Status,
        h.Players.Select(hp => new EventRowPlayer(hp.UserId, hp.Name, hp.AvatarUrl, hp.Score)).ToArray()
      ))
      .ToArrayAsync();

    return TypedResults.Ok(new EventsResponse(hunts, hunts.Length));
  }

  public static async Task<Ok<EventsResponse>> GetEventsLatest(AppDbContext db)
  {
    var rows = await db.Events
      .Where(h => h.Status == EventStatus.Live || h.Status == EventStatus.Over)
      .Select(h => new
      {
        h.Id,
        h.Name,
        h.StartAt,
        h.EndAt,
        h.Status,
        Players = h.Players.Select(hp => new { hp.UserId, hp.Name, hp.AvatarUrl, hp.Score })
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
    )).ToArray(), rows.Length));
  }

  public static async Task<Ok<EventsResponse>> GetEventsUpcoming(AppDbContext db)
  {
    var rows = await db.Events
      .Where(h => h.Status == EventStatus.New)
      .Select(h => new
      {
        h.Id,
        h.Name,
        h.StartAt,
        h.EndAt,
        h.Status,
        Players = h.Players.Select(hp => new { hp.UserId, hp.Name, hp.AvatarUrl, hp.Score })
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
      x.Players.Select(p => new EventRowPlayer(p.UserId, p.Name, p.AvatarUrl, p.Score)).ToArray()
    )).ToArray(), rows.Length));
  }

  public static async Task<Results<UnauthorizedHttpResult, Ok<EventRequest>>> GetEventEdit(ClaimsPrincipal user, AppDbContext db)
  {
    if (!user.Identity?.IsAuthenticated ?? false)
    {
      await Task.Delay(300);
      return TypedResults.Unauthorized();
    }

    // TODO: get defaults from database

    var nextSaturday = DateTime.UtcNow.AddDays(6 - (int)DateTime.UtcNow.DayOfWeek + 7).Date.AddHours(14);
    var defaultDesc = "Best score wins! New game, fresh character, seed will be chosen 5 minutes before the event begins\n\nHOW TO BEGIN:\nCreate a new character\nHave the seed created and ready by :00 on the hour\nStart the world at :00 (don't preload the world)\n\nRules:\nUsing Valheim seed finder is not allowed\nNo stream sniping other competitors\nNo clipping\nNo console commands\nUsing /printseeds is banned.\nUsing /die is allowed (however -20 points)\nNo emote animation cancelling.\nIf PC crashes, you may relog in and continue just make sure to immediately restart stream\n\nMUST BE STREAMING (Visible gameplay + audio is required)\nPreferred Youtube/Twitch as livestreaming service.\nPlease turn on past broadcasting on twitch so we can review video if needed.\n\nPoint system (All trophies only count once) example: 37 deer trophies = 10 points";
    var req = new EventRequest(0, "New Tournament", defaultDesc, "TrophyHunt", "hunt-2024-11",
      nextSaturday, 4, "(random)", (int)EventStatus.Draft);
    return TypedResults.Ok(req);
  }

  public record EventDetails(int Id, string Name, string Desc, string Mode, Dictionary<string, int> Scoring, DateTime StartAt, DateTime EndAt, float Hours, string Seed, int Status, string CreatedBy, string UpdatedBy, DateTime UpdatedAt);
  public static async Task<Results<NotFound, Ok<EventDetails>>> GetEvent(int id, AppDbContext db)
  {
    var hunt = await db.Events
      .Where(h => h.Id == id)
      .Select(h => new EventDetails(
        h.Id,
        h.Name,
        h.Desc,
        h.Mode,
        h.Scoring.Scores,
        h.StartAt,
        h.EndAt,
        h.Hours,
        h.Seed,
        (int)h.Status,
        h.CreatedBy,
        h.UpdatedBy,
        h.UpdatedAt
      ))
      .FirstOrDefaultAsync();
    if (hunt == null)
    {
      return TypedResults.NotFound();
    }
    return TypedResults.Ok(hunt);
  }

  public record EventRequest(int Id, string Name, string Desc, string Mode, string ScoringCode, DateTime StartAt, int Hours, string Seed, int Status);
  public record EventResponse(int Id);

  public static async Task<Results<NotFound, ValidationProblem, Ok<EventResponse>, CreatedAtRoute<EventResponse>>>
    PostEvent(EventRequest req, AppDbContext db, ClaimsPrincipal cp)
  {
    // TODO: Validate request

    var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    var user = await db.Users.FindAsync(userId);

    Event? hunt = null;
    var now = DateTime.UtcNow;
    if (req.Id > 0)
    {
      hunt = await db.Events.FindAsync(req.Id);
      if (hunt == null)
      {
        return TypedResults.NotFound();
      }
    }
    else
    {
      hunt = new Event();
      hunt.CreatedAt = now;
      hunt.CreatedBy = user!.Username;
      hunt.Players = [new Player { UserId = userId, Name = user.Username, AvatarUrl = user.AvatarUrl, 
        Status = PlayerStatus.PlayerAdmin, Stream = user.Youtube ?? user.Twitch ?? "N/A", UpdatedAt = now }];
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
    hunt.Prizes = new Dictionary<string, string>() { { "1st", "(unknown)" } };
    hunt.UpdatedAt = now;
    hunt.UpdatedBy = user!.Username;
    await db.SaveChangesAsync();

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

  public record PlayerLogRow(string Code, DateTime At);
  public record PlayerReq(int UserId, string? Stream, int? Score, PlayerLogRow[]? logs);
  public record PlayerResp(int EventId, int UserId, string Name, string AvatarUrl, string Stream, int Score, PlayerLogRow[] logs, DateTime UpdatedAt);
  private static async Task<Results<Ok<PlayerResp>, ValidationProblem, NotFound>> PostPlayer(int id, PlayerReq req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    var player = await db.Players
      .Where(hp => hp.EventId == id)
      .Where(hp => hp.UserId == req.UserId)
      .FirstOrDefaultAsync();

    if (player == null)
    {
      var userInfo = await db.Users
        .Where(u => u.Id == req.UserId)
        .Select(u => new { u.Username, u.AvatarUrl, u.Youtube, u.Twitch })
        .SingleAsync();
      player = new Player { EventId = id, UserId = req.UserId, Name = userInfo.Username, AvatarUrl = userInfo.AvatarUrl };
      player.Stream = req.Stream ?? userInfo.Youtube ?? userInfo.Twitch ?? "N/A";
      db.Players.Add(player);
    }

    player.Stream = req.Stream ?? player.Stream ?? "N/A";
    player.Score = req.Score ?? player.Score;
    if (req.logs != null)
    {
      foreach (var log in req.logs)
      {
        if (!player.Logs.Any(x => x.Code == log.Code && x.At == log.At))
        {
          player.Logs.Add(new PlayerLog(log.Code, log.At));
        }
      }
    }

    player.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    var resp = new PlayerResp(id, req.UserId, player.Name, player.AvatarUrl, player.Stream, player.Score,
      player.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray(), player.UpdatedAt);
    return TypedResults.Ok(resp);
  }

  public record EventPlayersRow(int UserId, string Name, string AvatarUrl, int Score, PlayerLogRow[] logs);
  private static async Task<Results<NotFound, Ok<EventPlayersRow[]>>> GetPlayers(int id, AppDbContext db)
  {
    await Task.Delay(300);
    var players = await db.Players
      .Where(hp => hp.EventId == id)
      .Select(hp => new EventPlayersRow(
        hp.UserId,
        hp.Name,
        hp.AvatarUrl,
        hp.Score,
        hp.Logs.Select(l => new PlayerLogRow(l.Code, l.At)).ToArray()
      ))
      .ToArrayAsync();

    return TypedResults.Ok(players);
  }

}