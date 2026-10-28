using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleWorlds;

/// <summary>
/// First-party usage events from the Worlds pages (web/src/analytics.ts): which
/// seeds people generate and open, how far they zoom, what they click, on what
/// kind of device. Anonymous visitors are a random per-tab session id; logged-in
/// users also get their user id. No IP addresses, no third parties.
///
///   POST api/worlds/usage                 anyone — a batch ({ session, device, events: [{ kind, seed?, data? }] })
///   GET  api/admin/worlds/usage/summary   owner  — aggregates over the last N days (?days=7)
///   GET  api/admin/worlds/usage/recent    owner  — the latest events (?limit=200&amp;kind=)
///
/// Table: Migrations/WorldEvents.sql. Until it exists, events are accepted and dropped.
/// POST is rate limited per client (in memory: the address is the limiter's key, never stored).
/// </summary>
public static class WorldsEvents
{
    const int MaxBatch = 50;
    const int MaxDataChars = 2000;
    static readonly Regex KindPattern = new(@"^[a-z][a-z_]{0,31}$", RegexOptions.Compiled);
    static readonly Regex SessionPattern = new(@"^[A-Za-z0-9-]{8,64}$", RegexOptions.Compiled);
    static readonly HashSet<string> Devices = ["desktop", "mobile", "tablet"];

    const string RatePolicy = "worlds-usage";
    /// <summary>Requests per client per minute. The page sends a batch every ~8 s at most
    /// (plus one when hidden), so a real visitor stays far below it, even a few tabs.</summary>
    const int RatePerMinute = 30;

    internal static void AddRateLimit(IServiceCollection services) => services.AddRateLimiter(o =>
    {
        o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        o.AddPolicy(RatePolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = RatePerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    });

    /// <summary>The client's address: the first X-Forwarded-For hop behind the Azure front end, else the socket's.</summary>
    static string ClientKey(HttpContext ctx)
    {
        var fwd = ctx.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrEmpty(fwd)) return fwd.Split(',')[0].Trim();
        return ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    internal static void Map(WebApplication app)
    {
        app.MapPost("api/worlds/usage", PostEvents).DisableAntiforgery().RequireRateLimiting(RatePolicy);
        app.MapGet("api/admin/worlds/usage/summary", GetSummary).RequireAuthorization();
        app.MapGet("api/admin/worlds/usage/recent", GetRecent).RequireAuthorization();
    }

    public record EventIn(string Kind, string? Seed, JsonElement? Data);
    public record EventsReq(string Session, string? Device, EventIn[] Events);

    public static async Task<Results<NoContent, ProblemHttpResult>> PostEvents(EventsReq req, ClaimsPrincipal user, AppDbContext db)
    {
        if (req.Events is not { Length: > 0 }) return TypedResults.NoContent();
        if (req.Events.Length > MaxBatch) return TypedResults.Problem("Too many events", statusCode: 400);
        if (!SessionPattern.IsMatch(req.Session ?? "")) return TypedResults.Problem("Invalid session", statusCode: 400);
        var device = req.Device is { } d && Devices.Contains(d) ? d : null;
        int? userId = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
        var now = DateTime.UtcNow;

        foreach (var e in req.Events)
        {
            if (!KindPattern.IsMatch(e.Kind ?? "")) return TypedResults.Problem("Invalid event kind", statusCode: 400);
            var seed = e.Seed?.Trim();
            if (seed is { Length: > 64 }) return TypedResults.Problem("Invalid seed", statusCode: 400);
            string? data = null;
            if (e.Data is { ValueKind: JsonValueKind.Object } obj)
            {
                data = obj.GetRawText();
                if (data.Length > MaxDataChars) return TypedResults.Problem("Event data too large", statusCode: 400);
            }
            db.WorldEvents.Add(new WorldEvent
            {
                At = now, Session = req.Session!, UserId = userId, Kind = e.Kind!, Seed = seed, Device = device, Data = data,
            });
        }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UndefinedTable })
        {
            // Migrations/WorldEvents.sql not run yet: drop them rather than fail the page.
        }
        return TypedResults.NoContent();
    }

    public record CountRow(string Key, int Count);
    public record SeedRow(string Seed, int Generated, int Opened, int Sessions, double? AvgGenerateSeconds);
    public record SummaryResp(int Days, int Events, int Sessions, int LoggedInUsers,
        CountRow[] Kinds, CountRow[] Devices, SeedRow[] Seeds, CountRow[] PoiClicks,
        double? AvgMaxZoom, CountRow[] ZoomDepth, CountRow[] Sources, CountRow[] PoiHovers, CountRow[] MarkerFilters);

    /// <summary>Aggregates over the last <paramref name="days"/> days (computed in memory, capped at 100k events).</summary>
    public static async Task<Results<Ok<SummaryResp>, ForbidHttpResult>> GetSummary(ClaimsPrincipal user, AppDbContext db, int? days)
    {
        if (!WorldsPublic.IsOwner(user)) return TypedResults.Forbid();
        int n = Math.Clamp(days ?? 7, 1, 90);
        var since = DateTime.UtcNow.AddDays(-n);
        List<WorldEvent> rows;
        try
        {
            rows = await db.WorldEvents.AsNoTracking().Where(e => e.At >= since).OrderByDescending(e => e.At).Take(100_000).ToListAsync();
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable) { rows = []; }

        static double? Num(WorldEvent e, string field)
        {
            if (e.Data == null) return null;
            using var doc = JsonDocument.Parse(e.Data);
            return doc.RootElement.TryGetProperty(field, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
        }
        static string? Str(WorldEvent e, string field)
        {
            if (e.Data == null) return null;
            using var doc = JsonDocument.Parse(e.Data);
            return doc.RootElement.TryGetProperty(field, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        }
        static CountRow[] Count(IEnumerable<string?> keys) =>
            keys.Where(k => k != null).GroupBy(k => k!).Select(g => new CountRow(g.Key, g.Count())).OrderByDescending(r => r.Count).ToArray();

        var seeds = rows.Where(e => e.Seed != null).GroupBy(e => e.Seed!)
            .Select(g => new SeedRow(g.Key,
                g.Count(e => e.Kind == "generate_done"),
                g.Count(e => e.Kind == "world_open"),
                g.Select(e => e.Session).Distinct().Count(),
                g.Where(e => e.Kind == "generate_done").Select(e => Num(e, "totalMs")).Where(v => v != null).Select(v => v!.Value / 1000).DefaultIfEmpty().Average() is var avg && avg > 0 ? avg : null))
            .OrderByDescending(r => r.Generated + r.Opened).Take(100).ToArray();
        // poi_hovers events carry { counts: { prefab: n } } for a stretch of hovering.
        var hovers = new Dictionary<string, int>();
        foreach (var e in rows.Where(e => e.Kind == "poi_hovers" && e.Data != null))
        {
            using var doc = JsonDocument.Parse(e.Data!);
            if (!doc.RootElement.TryGetProperty("counts", out var counts) || counts.ValueKind != JsonValueKind.Object) continue;
            foreach (var c in counts.EnumerateObject())
                if (c.Value.ValueKind == JsonValueKind.Number)
                    hovers[c.Name] = hovers.GetValueOrDefault(c.Name) + c.Value.GetInt32();
        }
        // marker_filter: "group Dungeons: hide", "type Crypt: show", "show all".
        var filters = rows.Where(e => e.Kind == "marker_filter").Select(e =>
        {
            var action = Str(e, "action");
            if (action == "show_all") return "show all";
            if (action == null) return null;
            using var doc = JsonDocument.Parse(e.Data!);
            var hide = doc.RootElement.TryGetProperty("hide", out var h) && h.ValueKind == JsonValueKind.True;
            return $"{action} {Str(e, "target")}: {(hide ? "hide" : "show")}";
        });

        var zooms = rows.Where(e => e.Kind == "view_end").Select(e => Num(e, "maxZoom")).Where(v => v != null).Select(v => v!.Value).ToList();

        return TypedResults.Ok(new SummaryResp(n, rows.Count,
            rows.Select(e => e.Session).Distinct().Count(),
            rows.Where(e => e.UserId != null).Select(e => e.UserId).Distinct().Count(),
            Count(rows.Select(e => e.Kind)),
            Count(rows.GroupBy(e => e.Session).Select(g => g.First().Device ?? "unknown")),
            seeds,
            Count(rows.Where(e => e.Kind == "poi_click").Select(e => Str(e, "prefab"))).Take(30).ToArray(),
            zooms.Count > 0 ? zooms.Average() : null,
            Count(zooms.Select(z => z < 1 ? "< 1x" : z < 2 ? "1-2x" : z < 5 ? "2-5x" : z < 10 ? "5-10x" : "10x+")),
            Count(rows.Where(e => e.Kind == "world_open").Select(e => Str(e, "source"))),
            hovers.Select(kv => new CountRow(kv.Key, kv.Value)).OrderByDescending(r => r.Count).Take(30).ToArray(),
            Count(filters).Take(30).ToArray()));
    }

    public record EventRow(long Id, DateTime At, string Session, int? UserId, string Kind, string? Seed, string? Device, string? Data);

    public static async Task<Results<Ok<EventRow[]>, ForbidHttpResult>> GetRecent(ClaimsPrincipal user, AppDbContext db, int? limit, string? kind)
    {
        if (!WorldsPublic.IsOwner(user)) return TypedResults.Forbid();
        int n = Math.Clamp(limit ?? 200, 1, 1000);
        try
        {
            var q = db.WorldEvents.AsNoTracking();
            if (!string.IsNullOrEmpty(kind)) q = q.Where(e => e.Kind == kind);
            var rows = await q.OrderByDescending(e => e.Id).Take(n)
                .Select(e => new EventRow(e.Id, e.At, e.Session, e.UserId, e.Kind, e.Seed, e.Device, e.Data)).ToArrayAsync();
            return TypedResults.Ok(rows);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            return TypedResults.Ok(Array.Empty<EventRow>());
        }
    }
}

/// <summary>One usage event (table world_events).</summary>
public class WorldEvent
{
    public long Id { get; set; }
    public DateTime At { get; set; }
    public string Session { get; set; } = "";
    public int? UserId { get; set; }
    public string Kind { get; set; } = "";
    public string? Seed { get; set; }
    public string? Device { get; set; }
    /// <summary>Kind-specific details, as a JSON object (jsonb).</summary>
    public string? Data { get; set; }
}
