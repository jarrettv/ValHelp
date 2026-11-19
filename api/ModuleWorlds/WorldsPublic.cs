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
///   GET  api/worlds/public                 anonymous — the pinned seeds, default first,
///                                          with each one's user (avatar) and tag
///   PUT  api/admin/worlds/public           owner     — replace the list ({ seeds: [...] })
///   PUT  api/admin/worlds/public/{seed}    owner     — set its user and tag ({ userId, tag })
///
/// Table: Migrations/PublicWorlds.sql (+ PublicWorldsOwnerTag.sql). Until it
/// exists the list is just the fallback below, so deploying before running the
/// script changes nothing; without the user/tag columns the list still reads.
/// </summary>
public static class WorldsPublic
{
    public const string FallbackSeed = "JVModsFun";
    static readonly Regex SeedPattern = new(@"^\S.{0,63}$", RegexOptions.Compiled);
    public const int TagMax = 16;

    // Checked on every status poll, so keep it in memory briefly.
    static PublicResp? s_cache;
    static DateTime s_cachedAt;
    static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/worlds/public", GetPublic);
        app.MapPut("api/admin/worlds/public", PutPublic).RequireAuthorization();
        app.MapPut("api/admin/worlds/public/{seed}", PutMeta).RequireAuthorization();
    }

    public static bool IsOwner(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    /// <summary>The public seeds, default first.</summary>
    public static async Task<string[]> Seeds(AppDbContext db) => (await List(db)).Seeds;

    /// <summary>The public worlds, default first, with their user and tag.</summary>
    public static async Task<PublicResp> List(AppDbContext db)
    {
        if (s_cache != null && DateTime.UtcNow - s_cachedAt < CacheFor) return s_cache;
        PublicItem[] worlds;
        try
        {
            worlds = await (
                from w in db.PublicWorlds.AsNoTracking()
                join u in db.Users on w.UserId equals u.Id into us
                from u in us.DefaultIfEmpty()
                orderby w.SortOrder, w.PinnedAt
                select new PublicItem(w.Seed, w.Tag, w.UserId,
                    u == null ? null : u.Username, u == null ? null : u.AvatarUrl)
            ).ToArrayAsync();
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            worlds = [];   // script not run yet
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedColumn)
        {
            // PublicWorldsOwnerTag.sql not run yet: seeds only.
            worlds = (await db.PublicWorlds.AsNoTracking()
                    .OrderBy(w => w.SortOrder).ThenBy(w => w.PinnedAt)
                    .Select(w => w.Seed).ToArrayAsync())
                .Select(s => new PublicItem(s, null, null, null, null)).ToArray();
        }
        if (worlds.Length == 0) worlds = [new PublicItem(FallbackSeed, null, null, null, null)];
        s_cache = new PublicResp(worlds.Select(w => w.Seed).ToArray(), worlds);
        s_cachedAt = DateTime.UtcNow;
        return s_cache;
    }

    /// <summary>The owner may open any seed; everyone else only a public one.</summary>
    public static async Task<bool> MayOpen(ClaimsPrincipal user, AppDbContext db, string seed) =>
        IsOwner(user) || (await Seeds(db)).Contains(seed);

    public record PublicItem(string Seed, string? Tag, int? UserId, string? Username, string? AvatarUrl);
    /// <summary>Seeds is kept for older clients; Worlds carries the same order.</summary>
    public record PublicResp(string[] Seeds, PublicItem[] Worlds);

    public static async Task<Ok<PublicResp>> GetPublic(AppDbContext db, HttpContext ctx)
    {
        ctx.Response.Headers.CacheControl = "no-cache";
        return TypedResults.Ok(await List(db));
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
        return TypedResults.Ok(await List(db));
    }

    public record MetaReq(int? UserId, string? Tag);

    public static async Task<Results<Ok<PublicResp>, BadRequest<string>, NotFound, ForbidHttpResult>> PutMeta(
        ClaimsPrincipal user, AppDbContext db, string seed, MetaReq req)
    {
        if (!IsOwner(user)) return TypedResults.Forbid();
        var row = await db.PublicWorlds.FindAsync(seed);
        if (row == null) return TypedResults.NotFound();
        var tag = (req.Tag ?? "").Trim();
        if (tag.Length > TagMax) return TypedResults.BadRequest($"Tag is at most {TagMax} characters");
        if (req.UserId is int uid && !await db.Users.AnyAsync(u => u.Id == uid))
            return TypedResults.BadRequest("No such user");
        row.UserId = req.UserId;
        row.Tag = tag.Length > 0 ? tag : null;
        await db.SaveChangesAsync();
        s_cache = null;
        return TypedResults.Ok(await List(db));
    }
}

public class PublicWorld
{
    public string Seed { get; set; } = null!;
    /// <summary>Position in the list; 0 is the default world.</summary>
    public int SortOrder { get; set; }
    public DateTime PinnedAt { get; set; }
    /// <summary>Whose world it is (shown by avatar), if anyone's.</summary>
    public int? UserId { get; set; }
    /// <summary>A tiny label shown beside the seed.</summary>
    public string? Tag { get; set; }
}
