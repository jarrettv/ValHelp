using System.Collections.Generic;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleSeries;

public static class SeriesEndpoints
{
    public static void MapSeriesEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("api/series");

        api.MapGet("", GetSeasons);
        api.MapGet("0", GetSeasonDefaults).RequireAuthorization();
        api.MapGet("{code}", GetSeason);
        api.MapPost("", PostSeason).RequireAuthorization();
    }

    private static async Task<Ok<SeasonListResponse>> GetSeasons(AppDbContext db, CancellationToken cancel)
    {
        var seasons = await db.Seasons
            .AsNoTracking()
            .Include(s => s.Owner)
            .OrderBy(s => s.Name)
            .ToListAsync(cancel);

        var codes = seasons.Select(s => s.Code).ToArray();

        var seasonEvents = await db.Events
            .AsNoTracking()
            .Where(e => e.SeasonCode != null && codes.Contains(e.SeasonCode))
            .Where(e => e.Status < EventStatus.Deleted)
            .Select(e => new
            {
                e.SeasonCode,
                Summary = new SeasonEventSummary(
                    e.Id,
                    e.Name,
                    e.StartAt,
                    e.EndAt,
                    e.Status,
                    e.Mode,
                    e.Hours)
            })
            .ToListAsync(cancel);

        var eventsLookup = seasonEvents
            .GroupBy(e => e.SeasonCode!)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => x.Summary)
                      .OrderBy(x => x.StartAt)
                      .ToArray());

        var summaries = seasons
            .Select(season =>
            {
                eventsLookup.TryGetValue(season.Code, out var eventSummaries);
                return ToSeasonSummary(season, eventSummaries);
            })
            .ToArray();

        var active = summaries
            .Where(s => s.IsActive)
            .OrderBy(s => s.UpcomingEvent?.StartAt ?? DateTime.MaxValue)
            .ThenBy(s => s.Name)
            .ToArray();

        var archived = summaries
            .Where(s => !s.IsActive)
            .OrderByDescending(s => s.UpdatedAt)
            .ThenBy(s => s.Name)
            .ToArray();

        return TypedResults.Ok(new SeasonListResponse(active, archived));
    }

    private static async Task<Results<UnauthorizedHttpResult, Ok<SeasonDetails>>> GetSeasonDefaults(ClaimsPrincipal user)
    {
        if (!user.Identity?.IsAuthenticated ?? false)
        {
            await Task.Delay(300);
            return TypedResults.Unauthorized();
        }

        var now = DateTime.UtcNow;
        var nextSaturday = now.Date.AddDays(((int)DayOfWeek.Saturday - (int)now.DayOfWeek + 7) % 7);
        if (nextSaturday <= now.Date)
        {
            nextSaturday = nextSaturday.AddDays(7);
        }
        nextSaturday = DateTime.SpecifyKind(nextSaturday, DateTimeKind.Utc);
        var firstEventStart = DateTime.SpecifyKind(nextSaturday.AddHours(18), DateTimeKind.Utc);

        var schedule = new SeasonScheduleDto(
            "Alternating Saturdays",
            "Season {seasonNum} Event {eventNum}",
            1,
            1,
            [
                new ScheduledEventDto(1, firstEventStart, "Season Kickoff", 4),
                new ScheduledEventDto(2, firstEventStart.AddDays(14), "Mid-season Challenge", 4)
            ]);

        var stats = new SeasonStatsDto(0, 0, 0);

        var resp = new SeasonDetails(
            "",
            "New Season",
            "Write a short pitch to get players excited.",
            "TrophyHunt",
            "### Welcome to your new season!\n\nUse this space to share rules, prize info, and how to join.",
            4,
            true,
            schedule,
            stats,
            Array.Empty<ScoreItem>(),
            Array.Empty<SeasonAdmin>(),
            null,
            null,
            Array.Empty<SeasonEventSummary>(),
            now,
            user.Identity?.Name ?? "Unknown",
            now,
            user.Identity?.Name ?? "Unknown",
            user.Identity?.Name ?? "Unknown");

        return TypedResults.Ok(resp);
    }

    private static async Task<Results<NotFound, Ok<SeasonDetails>>> GetSeason(string code, AppDbContext db, CancellationToken cancel)
    {
        var season = await db.Seasons
            .AsNoTracking()
            .Include(s => s.Owner)
            .FirstOrDefaultAsync(s => s.Code == code, cancel);

        if (season == null)
        {
            return TypedResults.NotFound();
        }

        var events = await db.Events
            .AsNoTracking()
            .Where(e => e.SeasonCode == season.Code)
            .Where(e => e.Status < EventStatus.Deleted)
            .Select(e => new SeasonEventSummary(
                e.Id,
                e.Name,
                e.StartAt,
                e.EndAt,
                e.Status,
                e.Mode,
                e.Hours))
            .OrderByDescending(e => e.StartAt)
            .ToArrayAsync(cancel);

        var latest = events
            .Where(e => e.StartAt <= DateTime.UtcNow || e.Status >= EventStatus.Live)
            .OrderByDescending(e => e.StartAt)
            .FirstOrDefault();

        var upcoming = events
            .Where(e => e.StartAt > DateTime.UtcNow && e.Status <= EventStatus.New)
            .OrderBy(e => e.StartAt)
            .FirstOrDefault();

        season.ScoreItems ??= new List<ScoreItem>();
        season.Admins ??= new List<SeasonAdmin>();
        season.Stats ??= new SeasonStats();

        var resp = new SeasonDetails(
            season.Code,
            season.Name,
            season.Pitch,
            season.Mode,
            season.Desc,
            season.Hours,
            season.IsActive,
            MapScheduleToDto(season.Schedule),
            MapStatsToDto(season.Stats),
            season.ScoreItems.ToArray(),
            season.Admins.ToArray(),
            latest,
            upcoming,
            events.OrderBy(e => e.StartAt).ToArray(),
            season.CreatedAt,
            season.CreatedBy,
            season.UpdatedAt,
            season.UpdatedBy,
            season.Owner.Username);

        return TypedResults.Ok(resp);
    }

    public record SeasonRequest(
        string Code,
        string Name,
        string Pitch,
        string Mode,
        string Desc,
        float Hours,
        bool IsActive,
        SeasonScheduleDto Schedule,
        ScoreItem[] ScoreItems,
        SeasonAdmin[] Admins);

    private static async Task<Results<UnauthorizedHttpResult, ValidationProblem, Ok<SeasonUpsertResponse>>> PostSeason(
        SeasonUpsertRequest req,
        AppDbContext db,
        ClaimsPrincipal cp,
        CancellationToken cancel)
    {
        var userId = int.Parse(cp.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await db.Users.FindAsync(userId, cancel);

        if (user == null)
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(req.Code))
        {
            return ValidationProblem("code", "Season code is required");
        }

        if (req.Code.Length > 40)
        {
            return ValidationProblem("code", "Season code must be 40 characters or fewer");
        }

        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length < 5)
        {
            return ValidationProblem("name", "Name must be at least 5 characters long");
        }

        if (req.Schedule == null)
        {
            return ValidationProblem("schedule", "Season schedule is required");
        }

        var season = await db.Seasons
            .Include(s => s.Owner)
            .FirstOrDefaultAsync(s => s.Code == req.Code, cancel);

        var now = DateTime.UtcNow;

        if (season == null)
        {
            season = new Season
            {
                Code = req.Code.Trim(),
                CreatedAt = now,
                CreatedBy = user.Username,
                OwnerId = userId,
                Owner = user,
                Stats = new SeasonStats(),
                Schedule = new Schedule
                {
                    Name = string.Empty,
                    EventNameTemplate = string.Empty,
                    SeasonNum = 0,
                    EventNumInit = 0,
                    Events = new List<ScheduledEvent>()
                },
                ScoreItems = new List<ScoreItem>(),
                Admins = new List<SeasonAdmin>()
            };
            db.Seasons.Add(season);
        }
        else
        {
            var authorized = userId == season.OwnerId || userId == 1 || cp.IsInRole("admin") || cp.IsInRole("Admin");
            if (!authorized)
            {
                return TypedResults.Unauthorized();
            }
        }

        season.Name = req.Name.Trim();
        season.Pitch = req.Pitch?.Trim() ?? string.Empty;
        season.Mode = req.Mode;
        season.Desc = req.Desc?.Trim() ?? string.Empty;
        season.Hours = req.Hours;
        season.IsActive = req.IsActive;
        season.ScoreItems = req.ScoreItems != null ? req.ScoreItems.ToList() : new List<ScoreItem>();
        season.Admins = req.Admins != null ? req.Admins.ToList() : new List<SeasonAdmin>();
        season.Schedule = MapDtoToSchedule(req.Schedule);
        season.Stats ??= new SeasonStats();
        season.UpdatedAt = now;
        season.UpdatedBy = user.Username;

        await db.SaveChangesAsync(cancel);

        return TypedResults.Ok(new SeasonUpsertResponse(season.Code));
    }

    private static SeasonSummary ToSeasonSummary(Season season, SeasonEventSummary[]? events)
    {
        events ??= Array.Empty<SeasonEventSummary>();

        var latest = events
            .Where(e => e.StartAt <= DateTime.UtcNow || e.Status >= EventStatus.Live)
            .OrderByDescending(e => e.StartAt)
            .FirstOrDefault();

        var upcoming = events
            .Where(e => e.StartAt > DateTime.UtcNow && e.Status <= EventStatus.New)
            .OrderBy(e => e.StartAt)
            .FirstOrDefault();

        return new SeasonSummary(
            season.Code,
            season.Name,
            season.Pitch,
            season.Mode,
            season.IsActive,
            season.Hours,
            MapScheduleToDto(season.Schedule),
            MapStatsToDto(season.Stats),
            latest,
            upcoming,
            events.Length,
            season.CreatedAt,
            season.CreatedBy,
            season.UpdatedAt,
            season.UpdatedBy);
    }

    private static SeasonScheduleDto MapScheduleToDto(Schedule schedule)
    {
        schedule ??= new Schedule
        {
            Name = "",
            EventNameTemplate = "",
            SeasonNum = 0,
            EventNumInit = 0,
            Events = []
        };

        return new SeasonScheduleDto(
            schedule.Name,
            schedule.EventNameTemplate,
            schedule.SeasonNum,
            schedule.EventNumInit,
            schedule.Events
                .OrderBy(e => e.StartAt)
                .Select(e => new ScheduledEventDto(
                    e.EventNum,
                    NormalizeToUtc(e.StartAt),
                    e.Name,
                    e.Hours))
                .ToArray());
    }

    private static SeasonStatsDto MapStatsToDto(SeasonStats? stats)
    {
        stats ??= new SeasonStats();
        return new SeasonStatsDto(stats.TotalEvents, stats.TotalPlayers, stats.UniquePlayers);
    }

    private static Schedule MapDtoToSchedule(SeasonScheduleDto dto)
    {
        var events = dto.Events ?? Array.Empty<ScheduledEventDto>();

        return new Schedule
        {
            Name = dto.Name,
            EventNameTemplate = dto.EventNameTemplate,
            SeasonNum = dto.SeasonNum,
            EventNumInit = dto.EventNumInit,
            Events = events
                .OrderBy(e => e.StartAt)
                .Select(e => new ScheduledEvent
                {
                    EventNum = e.EventNum,
                    StartAt = NormalizeToUtc(e.StartAt),
                    Name = e.Name,
                    Hours = e.Hours
                })
                .ToList()
        };
    }

    private static DateTime NormalizeToUtc(DateTime dateTime)
    {
        return dateTime.Kind switch
        {
            DateTimeKind.Utc => dateTime,
            DateTimeKind.Local => dateTime.ToUniversalTime(),
            _ => DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
        };
    }

    private static ValidationProblem ValidationProblem(string key, string message)
    {
        return TypedResults.ValidationProblem(new Dictionary<string, string[]>
        {
            { key, [message] }
        }, title: message);
    }
}

public record SeasonListResponse(SeasonSummary[] Active, SeasonSummary[] Archived);
public record SeasonSummary(
    string Code,
    string Name,
    string Pitch,
    string Mode,
    bool IsActive,
    float Hours,
    SeasonScheduleDto Schedule,
    SeasonStatsDto Stats,
    SeasonEventSummary? LatestEvent,
    SeasonEventSummary? UpcomingEvent,
    int EventCount,
    DateTime CreatedAt,
    string CreatedBy,
    DateTime UpdatedAt,
    string UpdatedBy);

public record SeasonScheduleDto(string Name, string EventNameTemplate, int SeasonNum, int EventNumInit, ScheduledEventDto[] Events);
public record ScheduledEventDto(int EventNum, DateTime StartAt, string Name, float Hours);
public record SeasonStatsDto(int TotalEvents, int TotalPlayers, int UniquePlayers);
public record SeasonEventSummary(int Id, string Name, DateTime StartAt, DateTime EndAt, EventStatus Status, string Mode, float Hours);

public record SeasonDetails(
    string Code,
    string Name,
    string Pitch,
    string Mode,
    string Desc,
    float Hours,
    bool IsActive,
    SeasonScheduleDto Schedule,
    SeasonStatsDto Stats,
    ScoreItem[] ScoreItems,
    SeasonAdmin[] Admins,
    SeasonEventSummary? LatestEvent,
    SeasonEventSummary? UpcomingEvent,
    SeasonEventSummary[] Events,
    DateTime CreatedAt,
    string CreatedBy,
    DateTime UpdatedAt,
    string UpdatedBy,
    string OwnerUsername);

public record SeasonUpsertRequest(
    string Code,
    string Name,
    string Pitch,
    string Mode,
    string Desc,
    float Hours,
    bool IsActive,
    SeasonScheduleDto Schedule,
    ScoreItem[] ScoreItems,
    SeasonAdmin[] Admins);

public record SeasonUpsertResponse(string Code);
