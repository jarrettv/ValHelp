using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleWorlds;

/// <summary>
/// Public worlds: the seeds anyone (logged in or not) may open on /worlds, in
/// order; the first is the one Worlds opens on. Only the site owner (user 1)
/// can open other seeds, and only the owner can change this list.
///
///   GET  api/worlds/public           anonymous — the pinned seeds, default first
///   PUT  api/admin/worlds/public     owner     — replace the list ({ seeds: [...] })
///
/// Table: Migrations/PublicWorlds.sql. Until it exists the list is just the
/// fallback below, so deploying before running the script changes nothing.
/// </summary>
public static class WorldsPublic
{
    public const string FallbackSeed = "JVModsFun";
    static readonly Regex SeedPattern = new(@"^\S.{0,63}$", RegexOptions.Compiled);

    // Checked on every status poll, so keep it in memory briefly.
    static string[]? s_cache;
    static DateTime s_cachedAt;
    static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/worlds/public", GetPublic);
        app.MapPut("api/admin/worlds/public", PutPublic).RequireAuthorization();
    }

    public static bool IsOwner(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    /// <summary>The public seeds, default first.</summary>
    public static async Task<string[]> Seeds(AppDbContext db)
    {
        if (s_cache != null && DateTime.UtcNow - s_cachedAt < CacheFor) return s_cache;
        string[] seeds;
        try
        {
            seeds = await db.PublicWorlds.AsNoTracking()
                .OrderBy(w => w.SortOrder).ThenBy(w => w.PinnedAt)
                .Select(w => w.Seed).ToArrayAsync();
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            seeds = [];   // script not run yet
        }
        if (seeds.Length == 0) seeds = [FallbackSeed];
        s_cache = seeds;
        s_cachedAt = DateTime.UtcNow;
        return seeds;
    }

    /// <summary>The owner may open any seed; everyone else only a public one.</summary>
    public static async Task<bool> MayOpen(ClaimsPrincipal user, AppDbContext db, string seed) =>
        IsOwner(user) || (await Seeds(db)).Contains(seed);

    public record PublicResp(string[] Seeds);

    public static async Task<Ok<PublicResp>> GetPublic(AppDbContext db, HttpContext ctx)
    {
        ctx.Response.Headers.CacheControl = "no-cache";
        return TypedResults.Ok(new PublicResp(await Seeds(db)));
    }

    public record PutReq(string[] Seeds);

    public static async Task<Results<Ok<PublicResp>, BadRequest<string>, ForbidHttpResult>> PutPublic(
        ClaimsPrincipal user, AppDbContext db, PutReq req)
    {
        if (!IsOwner(user)) return TypedResults.Forbid();
        var seeds = (req.Seeds ?? []).Select(s => (s ?? "").Trim()).Where(s => s.Length > 0).Distinct().ToArray();
        if (seeds.Length == 0) return TypedResults.BadRequest("Keep at least one public world");
        if (seeds.Length > 50 || seeds.Any(s => !SeedPattern.IsMatch(s))) return TypedResults.BadRequest("Invalid seed");

        var now = DateTime.UtcNow;
        var existing = await db.PublicWorlds.ToDictionaryAsync(w => w.Seed);
        db.PublicWorlds.RemoveRange(existing.Values.Where(w => !seeds.Contains(w.Seed)));
        for (int i = 0; i < seeds.Length; i++)
        {
            if (existing.TryGetValue(seeds[i], out var row)) row.SortOrder = i;
            else db.PublicWorlds.Add(new PublicWorld { Seed = seeds[i], SortOrder = i, PinnedAt = now });
        }
        await db.SaveChangesAsync();
        s_cache = null;
        return TypedResults.Ok(new PublicResp(await Seeds(db)));
    }
}

public class PublicWorld
{
    public string Seed { get; set; } = null!;
    /// <summary>Position in the list; 0 is the default world.</summary>
    public int SortOrder { get; set; }
    public DateTime PinnedAt { get; set; }
}
