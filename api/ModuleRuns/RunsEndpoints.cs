using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleRuns;

public static class RunsEndpoints
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/runs").RequireAuthorization();

        api.MapGet("", GetRuns);
        api.MapGet("{id:int}", GetRun);
        api.MapPost("", PostRun);
        api.MapPut("{id:int}", PutRun);
    }

    public record RunRow(int Id, string Name, string Category, int DurationSeconds, DateTime UpdatedAt);
    public record RunDetails(int Id, string Name, string Category, int DurationSeconds, RunEvent[] Events, DateTime CreatedAt, DateTime UpdatedAt);

    public record RunUpsert(string Name, string Category, int DurationSeconds, RunEvent[] Events);

    private static int GetUserId(ClaimsPrincipal cp)
    {
        return int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
    }

    public static async Task<Ok<RunRow[]>> GetRuns(AppDbContext db, ClaimsPrincipal cp, CancellationToken token)
    {
        var userId = GetUserId(cp);

        var rows = await db.Set<Run>()
            .AsNoTracking()
            .Where(r => r.OwnerId == userId)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new RunRow(r.Id, r.Name, r.Category, r.DurationSeconds, r.UpdatedAt))
            .ToArrayAsync(token);

        return TypedResults.Ok(rows);
    }

    public static async Task<Results<NotFound, Ok<RunDetails>>> GetRun(int id, AppDbContext db, ClaimsPrincipal cp, CancellationToken token)
    {
        var userId = GetUserId(cp);

        var run = await db.Set<Run>()
            .AsNoTracking()
            .Where(r => r.Id == id && r.OwnerId == userId)
            .Select(r => new RunDetails(r.Id, r.Name, r.Category, r.DurationSeconds, r.Events.ToArray(),
                r.CreatedAt, r.UpdatedAt))
            .FirstOrDefaultAsync(token);

        if (run == null)
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(run);
    }

    public static async Task<Created<RunDetails>> PostRun(RunUpsert req, AppDbContext db, ClaimsPrincipal cp, CancellationToken token)
    {
        var userId = GetUserId(cp);

        var now = DateTime.UtcNow;
        var run = new Run
        {
            Name = req.Name?.Trim() ?? "",
            Category = req.Category?.Trim() ?? "",
            DurationSeconds = req.DurationSeconds,
            OwnerId = userId,
            CreatedAt = now,
            UpdatedAt = now,
            Events = req.Events?.ToList() ?? []
        };

        db.Add(run);
        await db.SaveChangesAsync(token);

        return TypedResults.Created($"/api/runs/{run.Id}", new RunDetails(run.Id, run.Name, run.Category, run.DurationSeconds, [.. run.Events], run.CreatedAt, run.UpdatedAt));
    }

    public static async Task<Results<NotFound, Ok<RunDetails>>> PutRun(int id, RunUpsert req, AppDbContext db, ClaimsPrincipal cp, CancellationToken token)
    {
        var userId = GetUserId(cp);

        var run = await db.Set<Run>()
            .Where(r => r.Id == id && r.OwnerId == userId)
            .FirstOrDefaultAsync(token);

        if (run == null)
        {
            return TypedResults.NotFound();
        }

        run.Name = req.Name?.Trim() ?? "";
        run.Category = req.Category?.Trim() ?? "";
        run.DurationSeconds = req.DurationSeconds;
        run.UpdatedAt = DateTime.UtcNow;

        run.Events.Clear();
        if (req.Events != null)
        {
            run.Events.AddRange(req.Events);
        }

        await db.SaveChangesAsync(token);

        return TypedResults.Ok(new RunDetails(run.Id, run.Name, run.Category, run.DurationSeconds, [.. run.Events], run.CreatedAt, run.UpdatedAt));
    }
}
