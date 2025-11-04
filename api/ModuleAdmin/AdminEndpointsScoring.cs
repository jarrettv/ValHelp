
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleAdmin;

public record ScoringList(ScoringRecord[] Data, int Total);
public record ScoringRecord(string Code, string Name, Dictionary<string, int> Scores, Dictionary<string, float>? Rates, string DropRateType, string[] Modes, bool IsActive);

public static class AdminEndpointsScoring
{
    public static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/scoring");//.RequireAuthorization();
        api.MapPost("", PostScoring).RequireAuthorization("Admin");
        api.MapGet("", GetScorings);
        api.MapGet("{code:alpha}", GetScoring);
    }

    public static async Task<Ok<ScoringRecord>> PostScoring(AppDbContext db, ScoringRecord req)
    {
        var scoring = db.Scorings.SingleOrDefault(s => s.Code == req.Code);

        if (scoring == null)
        {
            scoring = new Scoring
            {
                Code = req.Code,
                IsActive = true,
            };
            db.Scorings.Add(scoring);
        }

        scoring.Name = req.Name;
        scoring.Scores = req.Scores;
        scoring.Rates = req.Rates ?? [];
        scoring.DropRateType = req.DropRateType;
        scoring.Modes = req.Modes;
        scoring.IsActive = req.IsActive;
        await db.SaveChangesAsync();

        return TypedResults.Ok(req);
    }

    public static async Task<Ok<ScoringList>> GetScorings(AppDbContext db)
    {
        var scorings = await db.Scorings
          .Where(s => s.IsActive)
          .Select(s => new ScoringRecord(s.Code, s.Name, s.Scores, s.Rates, s.DropRateType, s.Modes.ToArray(), s.IsActive))
          .ToArrayAsync();

        return TypedResults.Ok(new ScoringList(scorings, scorings.Length));
    }

    public static async Task<Results<Ok<ScoringRecord>, NotFound>> GetScoring(AppDbContext db, string code)
    {
        var scoring = await db.Scorings
          .Where(s => s.Code == code)
      .Select(s => new ScoringRecord(s.Code, s.Name, s.Scores, s.Rates, s.DropRateType, s.Modes.ToArray(), s.IsActive))
          .SingleOrDefaultAsync();

        if (scoring == null)
        {
            return TypedResults.NotFound();
        }
        return TypedResults.Ok(scoring);
    }
}
