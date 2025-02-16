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
    app.MapPost("api/track/hunt", PostTrackHunt2);
    app.MapPost("api/track/log", PostTrackLog);
    app.MapPost("api/track/logs", PostTrackLogs);
    app.MapGet("api/track/standings", GetTrackStandings);
  }

  public record TrackHuntRequest(string Player_Id, string Player_Name, string Player_Location, string Session_Id, int Current_Score, int Deaths, int Logouts, string Trophies, string Gamemode, JsonNode Extra);
  public record TrackHuntResponse(DateTime At);

  public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>> PostTrackHunt(TrackHuntRequest req, Channel<TrackHunt> channel)
  {
    // TODO: Validate request

    var hunt = new TrackHunt();
    hunt.CreatedAt = DateTime.UtcNow;
    hunt.PlayerId = req.Player_Id;
    hunt.PlayerName = req.Player_Name;
    hunt.PlayerLocation = req.Player_Location;
    hunt.SessionId = req.Session_Id;
    hunt.CurrentScore = req.Current_Score;
    hunt.Deaths = req.Deaths;
    hunt.Logouts = req.Logouts;
    hunt.Trophies = req.Trophies.Split(',').Select(t => t.Trim()).ToArray();
    hunt.Gamemode = req.Gamemode;
    
    await channel.Writer.WriteAsync(hunt);
    return TypedResults.Ok(new TrackHuntResponse(hunt.CreatedAt));
  }
  
  public record TrackHunt2Req(string Id, string User, string Seed, string Mode, int Score, int Deaths, int Relogs, int Slashdies, string[] Trophies);

  public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>> PostTrackHunt2(TrackHunt2Req req, Channel<TrackHunt> channel)
  {
    // TODO: Validate request and use ValidationProblem

    var hunt = new TrackHunt();
    hunt.CreatedAt = DateTime.UtcNow;
    hunt.PlayerId = req.Id;
    hunt.PlayerName = req.User;
    hunt.PlayerLocation = "";
    hunt.SessionId = req.Seed;
    hunt.CurrentScore = req.Score;
    hunt.Deaths = req.Deaths;
    hunt.Logouts = req.Relogs;
    //hunt.Slashdies = req.Slashdies;
    hunt.Trophies = req.Trophies.ToArray();
    hunt.Gamemode = req.Mode;

    await channel.Writer.WriteAsync(hunt);
    return TypedResults.Ok(new TrackHuntResponse(hunt.CreatedAt));
  }


  public record TrackLogReq(string Id, string Seed, int Score, string Code);
  public record TrackLogResp(DateTime At, string Id);

  public static async Task<Results<ValidationProblem, Ok<TrackLogResp>>> PostTrackLog(TrackLogReq req, Channel<TrackLog> channel)
  {
    return await PostTrackLogs(new TrackLogsReq(req.Id, "", req.Seed, "", req.Score, [new TrackerLog(req.Code, DateTime.UtcNow)]), channel);
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
    var later = DateTime.UtcNow.AddHours(-2);

    var resp = await db.Events
      .Where(h => h.Status == EventStatus.Live || (h.Status == EventStatus.Over && later < h.EndAt))
      .Where(h => h.Seed == seed)
      .Where(h => h.Mode == mode)
      .Select(h => new TrackStandingsResp(h.Name, h.Mode, h.StartAt, h.EndAt, h.Status, 
        h.Players.Where(x => x.Status >= 0).Select(hp => new TrackStandingsPlayer(hp.User.DiscordId, hp.Name, hp.AvatarUrl, hp.Score)).ToArray()))
      .FirstOrDefaultAsync();

    if (resp == null)
    {
      return TypedResults.NotFound();
    }

    return TypedResults.Ok(resp);
  }
  
}