using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;

namespace ValHelpApi.ModuleWorlds;

public static class WorldsEndpoints
{
    // Last N viewAt timestamps kept per world to bound storage.
    const int MaxViewAtPerWorld = 50;

    // Allowed asset names + their seedgen file equivalents.
    static readonly Dictionary<string, string> AssetMap = new()
    {
        ["biomes"] = "bvec",
        ["mask"] = "forestMaskTexCache",
        ["pois"] = "pois",
    };

    public static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/worlds");
        api.MapGet("list", GetList).RequireAuthorization();
        api.MapPost("visit", PostVisit).RequireAuthorization();
        api.MapGet("status", GetStatus).RequireAuthorization();

        // Public assets — cacheable, served via seedgen proxy. Don't require auth so
        // the browser can use If-None-Match revalidation freely.
        app.MapGet("api/worlds/{seed}/{asset}", GetAsset);
    }

    static int UserId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record WorldListItem(string Seed, DateTime CreatedAt, DateTime LastViewAt, int ViewCount);

    public static async Task<Ok<WorldListItem[]>> GetList(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var prefs = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.Prefs)
            .SingleOrDefaultAsync();

        var worlds = prefs?.Worlds ?? [];
        var items = worlds
            .Select(w =>
            {
                var last = w.ViewAt.Count > 0 ? w.ViewAt[^1] : w.CreatedAt;
                return new WorldListItem(w.Seed, w.CreatedAt, last, w.ViewAt.Count);
            })
            .OrderByDescending(w => w.LastViewAt)
            .ToArray();

        return TypedResults.Ok(items);
    }

    public record VisitReq(string Seed);
    public record VisitResp(string Seed, int SeedHash, string Status, string? EstWait, int QueuePosition, string? Error);

    public static async Task<Results<Ok<VisitResp>, ProblemHttpResult>> PostVisit(
        ClaimsPrincipal user, AppDbContext db, IConfiguration config,
        IHttpClientFactory httpFactory, VisitReq req)
    {
        var seed = (req.Seed ?? "").Trim();
        if (string.IsNullOrWhiteSpace(seed) || seed.Length > 64)
            return TypedResults.Problem("Invalid seed", statusCode: 400);

        var userId = UserId(user);
        var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (currentUser == null)
            return TypedResults.Problem("User not found", statusCode: 404);

        currentUser.Prefs.Worlds ??= [];
        var entry = currentUser.Prefs.Worlds.FirstOrDefault(w => w.Seed == seed);
        var now = DateTime.UtcNow;
        if (entry == null)
        {
            entry = new UserPrefsWorld { Seed = seed, CreatedAt = now, ViewAt = [now] };
            currentUser.Prefs.Worlds.Add(entry);
        }
        else
        {
            entry.ViewAt.Add(now);
            if (entry.ViewAt.Count > MaxViewAtPerWorld)
                entry.ViewAt.RemoveRange(0, entry.ViewAt.Count - MaxViewAtPerWorld);
        }
        await db.SaveChangesAsync();

        var status = await SubmitToSeedGen(config, httpFactory, seed);
        return TypedResults.Ok(status);
    }

    public static async Task<Results<Ok<VisitResp>, ProblemHttpResult>> GetStatus(
        [FromQuery] string seed, IConfiguration config, IHttpClientFactory httpFactory)
    {
        seed = (seed ?? "").Trim();
        if (string.IsNullOrWhiteSpace(seed) || seed.Length > 64)
            return TypedResults.Problem("Invalid seed", statusCode: 400);

        var status = await SubmitToSeedGen(config, httpFactory, seed);
        return TypedResults.Ok(status);
    }

    /// <summary>
    /// Asks seedgen for a seed's status — POST /api/seedgen/submit is idempotent and acts as
    /// both "ensure queued" and "check status".
    /// </summary>
    static async Task<VisitResp> SubmitToSeedGen(IConfiguration config, IHttpClientFactory httpFactory, string seed)
    {
        var seedHash = Vh.Numerics.StableHash.GetStableHashCode(seed);
        var seedGenUrl = config["SeedGenUrl"];
        if (string.IsNullOrEmpty(seedGenUrl))
            return new VisitResp(seed, seedHash, "unknown", null, 0, "Seedgen not configured");

        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            var resp = await client.PostAsJsonAsync($"{seedGenUrl}/api/seedgen/submit", new { seed });
            if (!resp.IsSuccessStatusCode)
                return new VisitResp(seed, seedHash, "error", null, 0, $"Seedgen HTTP {(int)resp.StatusCode}");

            using var stream = await resp.Content.ReadAsStreamAsync();
            var body = await JsonSerializer.DeserializeAsync<SeedGenStatus>(stream, JsonOpts);
            return new VisitResp(seed, seedHash,
                body?.Status ?? "unknown",
                body?.EstWait,
                body?.QueuePosition ?? 0,
                body?.Error);
        }
        catch (Exception ex)
        {
            return new VisitResp(seed, seedHash, "error", null, 0, ex.Message);
        }
    }

    /// <summary>Proxy a seed asset from seedgen. Anonymous so browsers can revalidate freely.</summary>
    public static async Task<IResult> GetAsset(string seed, string asset, IConfiguration config, HttpContext ctx,
        IHttpClientFactory httpFactory)
    {
        if (!AssetMap.TryGetValue(asset, out var seedGenFile))
            return Results.NotFound();

        var seedGenUrl = config["SeedGenUrl"];
        if (string.IsNullOrEmpty(seedGenUrl)) return Results.NotFound();

        int seedHash = Vh.Numerics.StableHash.GetStableHashCode(seed);
        var url = $"{seedGenUrl}/api/v2/seed{seedHash}/{seedGenFile}";

        var client = httpFactory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        var clientEtag = ctx.Request.Headers.IfNoneMatch.ToString();
        if (!string.IsNullOrEmpty(clientEtag))
            request.Headers.TryAddWithoutValidation("If-None-Match", clientEtag);

        var resp = await client.SendAsync(request, ctx.RequestAborted);

        if (resp.StatusCode == HttpStatusCode.NotModified)
        {
            ctx.Response.StatusCode = 304;
            return Results.Empty;
        }

        if (!resp.IsSuccessStatusCode)
            return Results.NotFound();

        if (resp.Headers.ETag is { } etag)
            ctx.Response.Headers.ETag = etag.ToString();
        if (resp.Headers.CacheControl is { } cc)
            ctx.Response.Headers.CacheControl = cc.ToString();

        var contentType = resp.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        var bytes = await resp.Content.ReadAsByteArrayAsync(ctx.RequestAborted);
        return Results.File(bytes, contentType);
    }

    static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    record SeedGenStatus(int Id, string Seed, string Status, string? EstWait, int QueuePosition, string? Result, string? Error);
}
