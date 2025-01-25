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
    app.MapGet("api/hunts/list", async (AppDbContext db) =>
    {
      var hunts = await db.Hunts
        .Where(h => h.Status < HuntStatus.Old)
        .Select(h => new { h.Id, h.Name, h.StartAt, h.EndAt, h.Status })
        .ToListAsync();
      return Results.Ok(hunts);
    });

    app.MapGet("api/hunts/{id}", async (int id, AppDbContext db) =>
    {
      var hunt = await db.Hunts.FindAsync(id);
      if (hunt == null)
      {
        return Results.NotFound();
      }
      return Results.Ok(hunt);
    }).WithName("GetHunt");

    app.MapPost("api/hunts", PostHunt).RequireAuthorization();
    app.MapPost("api/trackhunt", PostTrackHunt).RequireAuthorization();
  }

  public record HuntRequest(int? Id, string Name, string Desc, Dictionary<string, int> Scoring, DateTime StartAt, DateTime EndAt, string Seed, Dictionary<string, int> Prizes, HuntStatus Status, string[] PlayerIds);
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

  public record TrackHuntRequest(string Player_Name, string Player_Location, string Session_Id, int Current_Score, int Deaths, int Logouts, string[] Trophies, string Gamemode, JsonNode Extra);
  public record TrackHuntResponse(int Id, int? HuntId, string PlayerId);

  public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>> 
    PostTrackHunt(TrackHuntRequest req, AppDbContext db, ClaimsPrincipal user)
  {
    // TODO: Validate request

    var trackHunt = new TrackHunt();
    trackHunt.CreatedAt = DateTime.UtcNow;
    trackHunt.PlayerName = req.Player_Name;
    trackHunt.SessionId = req.Session_Id;
    trackHunt.CurrentScore = req.Current_Score;
    trackHunt.Deaths = req.Deaths;
    trackHunt.Logouts = req.Logouts;
    trackHunt.Trophies = [.. req.Trophies];
    trackHunt.Gamemode = req.Gamemode;
    //trackHunt.Extra = req.Extra;
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
    await db.SaveChangesAsync();

    return TypedResults.Ok(new TrackHuntResponse(trackHunt.Id, liveHuntId, trackHunt.PlayerName));
  }
}