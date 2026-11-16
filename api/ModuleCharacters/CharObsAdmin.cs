using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
/// Admin control of the speedrun boss overlay, for when the game's saves lag the run:
///   GET    api/admin/obs/runs         tracked runs, newest save first
///   GET    api/admin/obs/runs/{id}    a run's boss progress: from the save, and with manual progress
///   PUT    api/admin/obs/runs/{id}    set its manual progress (CharObs.ObsOverride)
///   DELETE api/admin/obs/runs/{id}    clear it, back to the saves alone
/// </summary>
public static class CharObsAdmin
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/admin/obs/runs").RequireAuthorization();
        api.MapGet("", List);
        api.MapGet("{id:long}", Get);
        api.MapPut("{id:long}", Put);
        api.MapDelete("{id:long}", Delete);
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    public record RunItem(long Id, string Name, int UserId, string Username, string AvatarUrl, DateTime LatestFileTime, bool Manual);
    public record RunDetail(CharObs.RunOut Auto, CharObs.RunOut Effective, CharObs.ObsOverride Override, string Username);

    public static async Task<Results<Ok<RunItem[]>, ForbidHttpResult>> List(ClaimsPrincipal user, AppDbContext db, CancellationToken cancel)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        var runs = await db.Set<Character>().AsNoTracking()
            .OrderByDescending(c => c.LatestFileTime)
            .Take(200)
            .Join(db.Users, c => c.UserId, u => u.Id, (c, u) => new RunItem(c.Id, c.Name, u.Id, u.Username, u.AvatarUrl,
                c.LatestFileTime, db.Set<CharObsOverride>().Any(o => o.CharacterId == c.Id)))
            .ToArrayAsync(cancel);
        return TypedResults.Ok(runs);
    }

    public static async Task<Results<Ok<RunDetail>, NotFound, ForbidHttpResult>> Get(long id, ClaimsPrincipal user,
        AppDbContext db, CancellationToken cancel)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        return await Detail(id, db, cancel) is { } d ? TypedResults.Ok(d) : TypedResults.NotFound();
    }

    public static async Task<Results<Ok<RunDetail>, NotFound, BadRequest<string>, ForbidHttpResult>> Put(long id,
        CharObs.ObsOverride req, ClaimsPrincipal user, AppDbContext db, CancellationToken cancel)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        if (!await db.Set<Character>().AnyAsync(c => c.Id == id, cancel)) return TypedResults.NotFound();

        // Keep only real bosses, a step count per summon step, and nothing empty.
        var clean = new Dictionary<string, CharObs.BossOverride>();
        foreach (var (key, o) in req.Bosses ?? [])
        {
            if (!CharObs.IsBoss(key)) return TypedResults.BadRequest($"Unknown boss {key}");
            var n = CharObs.StepCount(key);
            int?[]? steps = o.Steps == null ? null
                : Enumerable.Range(0, n).Select(i => i < o.Steps.Length && o.Steps[i] is { } v ? (int?)Math.Clamp(v, 0, 99) : null).ToArray();
            if (steps != null && steps.All(s => s == null)) steps = null;
            if (o.Found == null && o.Defeated == null && steps == null) continue;
            clean[key] = new CharObs.BossOverride(o.Found, o.Defeated, steps);
        }

        var row = await db.Set<CharObsOverride>().SingleOrDefaultAsync(o => o.CharacterId == id, cancel);
        if (clean.Count == 0)
        {
            if (row != null) db.Remove(row);
        }
        else
        {
            if (row == null) db.Add(row = new CharObsOverride { CharacterId = id });
            row.Data = JsonSerializer.Serialize(new CharObs.ObsOverride(clean), CharSnapshotJson.Json);
            row.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(cancel);
        return await Detail(id, db, cancel) is { } d ? TypedResults.Ok(d) : TypedResults.NotFound();
    }

    public static async Task<Results<Ok<RunDetail>, NotFound, ForbidHttpResult>> Delete(long id, ClaimsPrincipal user,
        AppDbContext db, CancellationToken cancel)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        await db.Set<CharObsOverride>().Where(o => o.CharacterId == id).ExecuteDeleteAsync(cancel);
        return await Detail(id, db, cancel) is { } d ? TypedResults.Ok(d) : TypedResults.NotFound();
    }

    static async Task<RunDetail?> Detail(long id, AppDbContext db, CancellationToken cancel)
    {
        var c = await db.Set<Character>().AsNoTracking().Where(c => c.Id == id)
            .Join(db.Users, c => c.UserId, u => u.Id, (c, u) => new { c.Name, u.Username })
            .SingleOrDefaultAsync(cancel);
        if (c == null) return null;
        var run = await CharObs.Load(db, id, c.Name, cancel);
        return run is { } r ? new RunDetail(r.Auto, r.Effective, r.Override, c.Username) : null;
    }
}
