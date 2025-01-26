using System.Security.Claims;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public static class ModEndpoints
{
  public static void MapModEndpoints(this WebApplication app)
  {
    app.MapPost("api/trackhunt", PostTrackHunt);
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