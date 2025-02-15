using System.Data.Common;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public static class ImportEndpoints
{

  public static void MapImportEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/import");

    api.MapPost("", PostImport).RequireAuthorization();
  }

    public record ImportRequest(int HuntId);
    public record ImportResponse(DateTime At, int EventId);

    public static async Task<Results<NotFound, Ok<ImportResponse>>> PostImport(ImportRequest req, ClaimsPrincipal user, AppDbContext db, LoggerFactory logs)
    {
        var logger = logs.CreateLogger("ImportEndpoints.PostImport");
        var hunt = await db.Hunts
            .AsNoTracking()
            .Include(h => h.Players)
            .FirstOrDefaultAsync(h => h.Id == req.HuntId);
            
        if (hunt == null)
        {
            logger.LogWarning("Hunt {huntId} not found", req.HuntId);
            return TypedResults.NotFound();
        }

        var now = DateTime.UtcNow;
        var ev = new Event
        {
            Name = hunt.Name,
            StartAt = hunt.StartAt,
            EndAt = hunt.EndAt,
            Status = (EventStatus)hunt.Status,
            Mode = hunt.Name.Contains("Hunt") ? "TrophyHunt" : hunt.Name.Contains("Rush") ? "TrophyRush" : "TrophySaga",
            ScoringCode = "hunt-2024-11",
            Hours = (float)(hunt.EndAt - hunt.StartAt).TotalHours,
            Desc = hunt.Desc,
            Seed = hunt.Seed,
            Prizes = hunt.Prizes,
            Players = hunt.Players.Select(p => new Player
            {
                Name = p.Name,
                AvatarUrl = "https://example.com/avatar.jpg",
                Stream = p.Stream,
                Status = PlayerStatus.PlayerIn,
                Score = 0,
                UpdatedAt = now
            }).ToList(),
            CreatedAt = now,
            CreatedBy = hunt.CreatedBy,
            UpdatedAt = now,
            UpdatedBy = hunt.UpdatedBy,
        };
        
        return TypedResults.Ok(new ImportResponse(DateTime.UtcNow, 0));
    }
}