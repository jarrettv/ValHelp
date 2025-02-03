using System.Security.Claims;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public static class ModEndpoints
{
  public static void MapModEndpoints(this WebApplication app)
  {
    app.MapPost("api/trackhunt", PostTrackHunt);
    app.MapPost("api/track/log", PostTrackLog);
    app.MapPost("api/track/logs", PostTrackLogs);
    app.MapGet("api/track/standings", GetTrackStandings);
  }

  public record TrackHuntRequest(string Player_Id, string Player_Name, string Player_Location, string Session_Id, int Current_Score, int Deaths, int Logouts, string Trophies, string Gamemode, JsonNode Extra);
  public record TrackHuntResponse(DateTime At, int? EventId, int? UserId);

  public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>>
    PostTrackHunt(TrackHuntRequest req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    var trackHunt = new TrackHunt();
    trackHunt.CreatedAt = DateTime.UtcNow;
    trackHunt.PlayerId = req.Player_Id;
    trackHunt.PlayerName = req.Player_Name;
    trackHunt.PlayerLocation = req.Player_Location;
    trackHunt.SessionId = req.Session_Id;
    trackHunt.CurrentScore = req.Current_Score;
    trackHunt.Deaths = req.Deaths;
    trackHunt.Logouts = req.Logouts;
    trackHunt.Trophies = req.Trophies.Split(',').Select(t => t.Trim()).ToList();
    trackHunt.Gamemode = req.Gamemode;
    
    db.TrackHunts.Add(trackHunt);
    await db.SaveChangesAsync();

    int? liveEventId = await db.Events
      .Where(h => h.Status == EventStatus.Live)
      .Where(h => h.Seed == trackHunt.SessionId)
      .Select(h => h.Id)
      .FirstOrDefaultAsync();

    if (liveEventId == null)
    {
      return TypedResults.Ok(new TrackHuntResponse(trackHunt.CreatedAt, null, null));
    }

    var player = await db.Players
      .Where(hp => hp.EventId == liveEventId)
      .Where(hp => hp.User.DiscordId == req.Player_Id)
      .FirstOrDefaultAsync();

    if (player == null)
    {
      return TypedResults.Ok(new TrackHuntResponse(trackHunt.CreatedAt, null, null));
    }

    player.Update(trackHunt.CreatedAt, trackHunt.CurrentScore, trackHunt.Trophies, trackHunt.Deaths, trackHunt.Logouts);
    await db.SaveChangesAsync();

    return TypedResults.Ok(new TrackHuntResponse(trackHunt.CreatedAt, liveEventId, player.UserId));
  }

  public record TrackLogReq(string Id, string Seed, int Score, string Code, DateTime At);
  public record TrackLogResp(DateTime At, string Id);

  public static async Task<Results<ValidationProblem, Ok<TrackLogResp>>> PostTrackLog(TrackLogReq req, Channel<TrackLog> channel)
  {
    return await PostTrackLogs(new TrackLogsReq(req.Id, "", req.Seed, "", req.Score, [new TrackerLog(req.Code, req.At)]), channel);
  }

  public record TrackLogsReq(string Id, string User, string Seed, string Mode, int Score, TrackerLog[] Logs);

  public static async Task<Results<ValidationProblem, Ok<TrackLogResp>>> PostTrackLogs(TrackLogsReq req, Channel<TrackLog> channel)
  {
    // TODO: Validate request and use ValidationProblem

    var log = new TrackLog();
    log.At = DateTime.UtcNow;
    log.Id = req.Id;
    log.User = req.User;
    log.Seed = req.Seed;
    log.Mode = req.Mode;
    log.Score = req.Score;
    log.Logs = req.Logs.ToList();
    await channel.Writer.WriteAsync(log);

    return TypedResults.Ok(new TrackLogResp(log.At, log.Id));
  }

  public record TrackStandingsPlayer(string Id, string Name, string AvatarUrl, int Score);
  public record TrackStandingsResp(string Name, string Mode, DateTime StartAt, DateTime EndAt, EventStatus Status, TrackStandingsPlayer[] Players);

  public static async Task<Results<Ok<TrackStandingsResp>, NotFound>> GetTrackStandings([FromQuery]string seed, [FromQuery]string mode, AppDbContext db)
  {
    var later = DateTime.UtcNow.AddHours(1);

    var resp = await db.Events
      .Where(h => h.Status == EventStatus.Live || (h.Status == EventStatus.Over && h.EndAt < later))
      .Where(h => h.Seed == seed)
      .Where(h => h.Mode == mode)
      .Select(h => new TrackStandingsResp(h.Name, h.Mode, h.StartAt, h.EndAt, h.Status, 
        h.Players.Select(hp => new TrackStandingsPlayer(hp.User.DiscordId, hp.Name, hp.AvatarUrl, hp.Score)).ToArray()))
      .FirstOrDefaultAsync();

    if (resp == null)
    {
      return TypedResults.NotFound();
    }

    return TypedResults.Ok(resp);
  }
  
}