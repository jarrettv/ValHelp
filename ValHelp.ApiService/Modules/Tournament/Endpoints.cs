using System.Security.Claims;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelp.ApiService.Config;

namespace ValHelp.ApiService.Modules.Tournament;

public static class Endpoints
{
  public static void MapTournamentEndpoints(this WebApplication app)
  {
    app.MapGet("api/hunts/list", GetHuntList);
    app.MapGet("api/hunts/{id}", GetHunt).WithName("GetHunt");
    app.MapPost("api/hunts", PostHunt); //.RequireAuthorization();
    app.MapPost("api/hunts/players", PostHuntPlayer); //.RequireAuthorization();
    app.MapPost("api/trackhunt", PostTrackHunt); //.RequireAuthorization();
  }

  public record HuntRow(int Id, string Name, DateTime StartAt, DateTime EndAt, HuntStatus Status);
  public record HuntListResponse(HuntRow[] Data, int Total);
  public static async Task<Ok<HuntListResponse>> GetHuntList(AppDbContext db)
  {
    var hunts = await db.Hunts
      .Where(h => h.Status < HuntStatus.Deleted)
      .Select(h => new HuntRow(h.Id, h.Name, h.StartAt, h.EndAt, h.Status))
      .ToArrayAsync();

    return TypedResults.Ok(new HuntListResponse(hunts, hunts.Length));
  }

  public static async Task<Results<NotFound, Ok<Hunt>>> GetHunt(int id, AppDbContext db)
  {
    var hunt = await db.Hunts.FindAsync(id);
    if (hunt == null)
    {
      return TypedResults.NotFound();
    }
    return TypedResults.Ok(hunt);
  }

  public record HuntRequest(int? Id, string Name, string Desc, Dictionary<string, int> Scoring, DateTime StartAt, DateTime EndAt, string Seed, Dictionary<string, string> Prizes, HuntStatus Status, string[] PlayerIds);
  public record HuntResponse(int Id);

  public static async Task<Results<NotFound, ValidationProblem, Ok<HuntResponse>, CreatedAtRoute<HuntResponse>>>
    PostHunt(HuntRequest req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    Hunt? hunt = null;
    var now = DateTime.UtcNow;
    if (req.Id.HasValue)
    {
      hunt = await db.Hunts.FindAsync(req.Id);
      if (hunt == null)
      {
        return TypedResults.NotFound();
      }
    }
    else
    {
      hunt = new Hunt();
    }

    if (hunt.Id == 0)
    {
      hunt.CreatedAt = now;
      hunt.CreatedBy = user.Identity?.Name ?? "unknown";
    }
    hunt.Name = req.Name.Trim();
    hunt.Desc = req.Desc;
    hunt.Scoring = req.Scoring;
    hunt.StartAt = req.StartAt;
    hunt.EndAt = req.EndAt;
    hunt.Seed = req.Seed;
    hunt.Prizes = req.Prizes;
    hunt.Status = req.Status;
    hunt.UpdatedAt = now;
    hunt.UpdatedBy = user.Identity?.Name ?? "unknown";
    db.Hunts.Add(hunt);
    await db.SaveChangesAsync();

    var resp = new HuntResponse(hunt.Id);
    if (hunt.CreatedAt == now)
    {
      return TypedResults.CreatedAtRoute(resp, "GetHunt", new { id = hunt.Id });
    }
    else
    {
      return TypedResults.Ok(resp);
    }
  }

  public record PlayerReq(int HuntId, string PlayerId, string? Name, string? Stream, int? Score, int? Deaths, int? Relogs, string[]? Trophies);
  public record PlayerResp(int HuntId, string PlayerId, string Name, string Stream, int Score, int Deaths, int Relogs, string[] Trophies);
  private static async Task<Results<Ok<PlayerResp>, ValidationProblem, NotFound>> PostHuntPlayer(PlayerReq req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    var huntPlayer = await db.HuntPlayers
      .Where(hp => hp.HuntId == req.HuntId)
      .Where(hp => hp.PlayerId == req.PlayerId)
      .FirstOrDefaultAsync();

    if (huntPlayer == null)
    {
      huntPlayer = new HuntPlayer { HuntId = req.HuntId, PlayerId = req.PlayerId };
      db.HuntPlayers.Add(huntPlayer);
    }

    huntPlayer.Name = req.Name ?? huntPlayer.Name ?? req.PlayerId;
    huntPlayer.Stream = req.Stream ?? huntPlayer.Stream ?? "N/A";
    huntPlayer.Deaths = req.Deaths ?? huntPlayer.Deaths;
    huntPlayer.Relogs = req.Relogs ?? huntPlayer.Relogs;
    huntPlayer.Trophies = (req.Trophies != null) ? [.. req.Trophies] : huntPlayer.Trophies;
    huntPlayer.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    var resp = new PlayerResp(req.HuntId, req.PlayerId, huntPlayer.Name, huntPlayer.Stream, huntPlayer.Score, huntPlayer.Deaths, huntPlayer.Relogs, huntPlayer.Trophies.ToArray());
    return TypedResults.Ok(resp);
  }

  public record TrackHuntRequest(string Player_Name, string Player_Location, string Session_Id, int Current_Score, int Deaths, int Logouts, string Trophies, string Gamemode, JsonNode Extra);
  public record TrackHuntResponse(int Id, int? Hunt_Id, string Player_Id);

  public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>>
    PostTrackHunt(TrackHuntRequest req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    var trackHunt = new TrackHunt();
    trackHunt.CreatedAt = DateTime.UtcNow;
    trackHunt.PlayerName = req.Player_Name;
    trackHunt.PlayerLocation = req.Player_Location;
    trackHunt.SessionId = req.Session_Id;
    trackHunt.CurrentScore = req.Current_Score;
    trackHunt.Deaths = req.Deaths;
    trackHunt.Logouts = req.Logouts;
    trackHunt.Trophies = req.Trophies.Split(',').Select(t => t.Trim()).ToList();
    trackHunt.Gamemode = req.Gamemode;
    //trackHunt.Extra = req.Extra;
    db.TrackHunts.Add(trackHunt);
    await db.SaveChangesAsync();

    var liveHuntId = await db.Hunts
      .Where(h => h.Status == HuntStatus.Live)
      .Where(h => h.Seed == trackHunt.SessionId)
      .Select(h => h.Id)
      .FirstOrDefaultAsync();

    if (liveHuntId == 0)
    {
      return TypedResults.Ok(new TrackHuntResponse(trackHunt.Id, null, trackHunt.PlayerName));
    }

    var huntPlayer = await db.HuntPlayers
      .Where(hp => hp.HuntId == liveHuntId)
      .Where(hp => hp.PlayerId == trackHunt.PlayerName)
      .FirstOrDefaultAsync();

    if (huntPlayer == null)
    {
      return TypedResults.Ok(new TrackHuntResponse(trackHunt.Id, null, trackHunt.PlayerName));
    }

    huntPlayer.Score = trackHunt.CurrentScore;
    huntPlayer.Deaths = trackHunt.Deaths;
    huntPlayer.Relogs = trackHunt.Logouts;
    huntPlayer.Trophies = [.. trackHunt.Trophies];
    huntPlayer.UpdatedAt = DateTime.UtcNow;
    db.HuntPlayers.Update(huntPlayer);
    await db.SaveChangesAsync();

    return TypedResults.Ok(new TrackHuntResponse(trackHunt.Id, liveHuntId, trackHunt.PlayerName));
  }
}