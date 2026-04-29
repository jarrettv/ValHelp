using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsAuth
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/auth");

        api.MapGet("status", GetStatus);
        api.MapGet("users", GetUsers).RequireAuthorization("Admin");
        api.MapGet("discord", GetDiscord);
        api.MapGet("logout", GetLogout);
        api.MapGet("profile", GetProfile).RequireAuthorization();
        api.MapPost("profile", PostProfile).RequireAuthorization();
        api.MapPost("feedback", PostFeedback).RequireAuthorization();
        
        api.MapPost("profile/obs-code", PostObsCode).RequireAuthorization();
        api.MapGet("profile/stats", GetProfileStats).RequireAuthorization();

        api.MapGet("prefs/{code}", GetPrefs).RequireAuthorization();
        api.MapPost("prefs", PostPrefs).RequireAuthorization();
    }

    static int UserId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static async Task<Ok<StatusResp>> GetStatus(ClaimsPrincipal user, AppDbContext db)
    {
        var none = new StatusResp(0, "", "", false, "", "");
        if (user.Identity?.IsAuthenticated != true) return TypedResults.Ok(none);

        var userId = UserId(user);
        var currentUser = await db.Users
            .Where(u => u.Id == userId)
            .Select(x => new StatusResp(x.Id, x.Username, x.AvatarUrl, x.IsActive, x.Youtube, x.Twitch))
            .SingleOrDefaultAsync() ?? none;
        return TypedResults.Ok(currentUser);
    }

    public static async Task<Ok<List<UserListItem>>> GetUsers(AppDbContext db)
    {
        var users = await db.Users
            .Select(x => new UserListItem(
                x.Id, x.Username, x.Email, x.AvatarUrl, x.LastLoginAt, x.DiscordId, x.SteamId, x.AltName, x.IsActive))
            .ToListAsync();
        return TypedResults.Ok(users);
    }

    public static async Task GetDiscord(HttpContext ctx)
    {
        await ctx.ChallengeAsync("Discord");
    }

    public static async Task GetLogout(HttpContext ctx)
    {
        await ctx.SignOutAsync();
        ctx.Response.Redirect("/");
    }

    public static async Task<Ok<ProfileResp>> GetProfile(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var profile = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new ProfileResp(u.Id, u.Username, u.Email, u.DiscordId, u.AvatarUrl, u.Youtube, u.Twitch, u.SteamId, u.AltName, u.ObsSecretCode, u.Roles))
            .SingleAsync();
        return TypedResults.Ok(profile);
    }

    public static async Task<Results<Ok<ProfileResp>, ProblemHttpResult>> PostProfile(
        ClaimsPrincipal user, AppDbContext db, ProfileReq req)
    {
        var userId = UserId(user);
        var currentUser = await db.Users
            .Where(u => u.Id == userId)
            .SingleAsync();

        if (string.IsNullOrWhiteSpace(req.Username))
        {
            return TypedResults.Problem("Username cannot be empty", statusCode: 400);
        }

        if (!string.IsNullOrWhiteSpace(req.Youtube))
        {
            var youtube = req.Youtube.Replace("http://", "https://")
                .Replace("www.youtube.com", "youtube.com");
            if (!Uri.IsWellFormedUriString(youtube, UriKind.Absolute))
            {
                return TypedResults.Problem("Invalid Youtube URL", statusCode: 400);
            }
            if (!youtube.Contains("youtube.com"))
            {
                return TypedResults.Problem("Invalid Youtube URL", statusCode: 400);
            }
            var channelName = youtube.Split("/").Last();
            if (!channelName.StartsWith("@"))
            {
                return TypedResults.Problem("Please use your @ channel name", statusCode: 400);
            }
            currentUser.Youtube = youtube.Trim();
        }
        else
        {
            currentUser.Youtube = "";
        }

        if (!string.IsNullOrWhiteSpace(req.Twitch))
        {
            var twitch = req.Twitch.Replace("http://", "https://")
                .Replace("www.twitch.tv", "twitch.tv");
            if (!Uri.IsWellFormedUriString(twitch, UriKind.Absolute))
            {
                return TypedResults.Problem("Invalid Twitch URL", statusCode: 400);
            }
            if (!twitch.StartsWith("https://twitch.tv/"))
            {
                return TypedResults.Problem("Invalid Twitch URL", statusCode: 400);
            }
            currentUser.Twitch = twitch.Trim();
        }
        else
        {
            currentUser.Twitch = "";
        }
        currentUser.Username = req.Username.Trim();
        currentUser.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new ProfileResp(currentUser.Id, currentUser.Username, currentUser.Email, currentUser.DiscordId, currentUser.AvatarUrl,
            currentUser.Youtube, currentUser.Twitch, currentUser.SteamId, currentUser.AltName, currentUser.ObsSecretCode, currentUser.Roles));
    }

    public static async Task<Results<Ok, ProblemHttpResult>> PostFeedback(
        ClaimsPrincipal user, AppDbContext db, FeedbackReq req)
    {
        var msg = (req.Msg ?? "").Trim();
        if (msg.Length == 0) return TypedResults.Problem("Message is required", statusCode: 400);
        if (msg.Length > 2000) return TypedResults.Problem("Message too long (max 2000 chars)", statusCode: 400);

        var page = (req.Page ?? "").Trim();
        if (page.Length == 0 || page.Length > 500 || !page.StartsWith('/')
            || page.Contains('\n') || page.Contains('\r') || page.Contains('\0'))
        {
            return TypedResults.Problem("Invalid page", statusCode: 400);
        }

        var userId = UserId(user);
        var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (currentUser == null) return TypedResults.Problem("User not found", statusCode: 404);

        var existing = currentUser.Prefs.Feedback ?? [];
        var kept = existing.Count >= MaxFeedbackEntries
            ? existing[(existing.Count - MaxFeedbackEntries + 1)..]
            : existing;
        currentUser.Prefs.Feedback = [.. kept, new UserPrefsFeedback(page, msg, DateTime.UtcNow)];
        await db.SaveChangesAsync();
        return TypedResults.Ok();
    }

    public static async Task<Results<Ok<UserPrefsItems>, ProblemHttpResult>> GetPrefs(
        ClaimsPrincipal user, AppDbContext db, string code)
    {
        var userId = UserId(user);
        var prefs = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.Prefs)
            .SingleOrDefaultAsync();

        var data = code.ToLower() switch
        {
            "favs" => prefs?.Favs,
            "speedruns" => prefs?.SpeedRuns,
            _ => null
        };

        if (data == null) return TypedResults.Problem("User prefs not found", statusCode: 404);
        return TypedResults.Ok(data);
    }

    public static async Task<Results<Ok<ObsCodeResp>, NotFound>> PostObsCode(
        ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (currentUser == null) return TypedResults.NotFound();

        // Excludes ambiguous chars for easy reading.
        const string ObsCodeAlphabet = "abcdefghijkmnopqrstuv23456789";
        var code = $"obs-{RandomNumberGenerator.GetString(ObsCodeAlphabet, 4)}";
        currentUser.ObsSecretCode = code;
        currentUser.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new ObsCodeResp(code));
    }

    public static async Task<Ok<ProfileStats>> GetProfileStats(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);

        var createdCounts = await db.Events
            .AsNoTracking()
            .Where(e => e.OwnerId == userId && e.Status != EventStatus.Deleted)
            .GroupBy(e => e.IsPrivate)
            .Select(g => new { IsPrivate = g.Key, Count = g.Count() })
            .ToListAsync();
        var publicCreated = createdCounts.FirstOrDefault(x => !x.IsPrivate)?.Count ?? 0;
        var privateCreated = createdCounts.FirstOrDefault(x => x.IsPrivate)?.Count ?? 0;

        var playedRows = await db.Players
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.Event.Status != EventStatus.Deleted && p.Status >= 0)
            .Select(p => new { p.Event.IsPrivate, p.Event.Mode, p.Event.OwnerId, p.Score })
            .ToListAsync();
        var publicPlayedIn = playedRows.Count(p => !p.IsPrivate);
        var privatePlayedIn = playedRows.Count(p => p.IsPrivate);
        var bestScore = playedRows.Count == 0 ? 0 : playedRows.Where(p => p.Mode == "TrophyHunt").Max(p => p.Score);

        var trophyCount = await db.Players
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .SelectMany(p => p.Logs)
            .CountAsync(l => l.Code.StartsWith("Trophy"));

        return TypedResults.Ok(new ProfileStats(
            publicCreated, privateCreated, publicPlayedIn, privatePlayedIn, trophyCount, bestScore));
    }

    public static async Task<Results<Ok<UserPrefsItems>, ProblemHttpResult>> PostPrefs(
        ClaimsPrincipal user, AppDbContext db, PrefsItemsReq req)
    {
        if (req.Items.Length > MaxItemsPerSection) return TypedResults.Problem($"Too many items (max {MaxItemsPerSection})", statusCode: 400);
        foreach (var s in req.Items)
        {
            if (string.IsNullOrWhiteSpace(s) || s.Length > MaxItemCodeLen)
                return TypedResults.Problem("Invalid item code", statusCode: 400);
        }

        var items = req.Items.Distinct(StringComparer.Ordinal).ToArray();

        var userId = UserId(user);
        var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (currentUser == null) return TypedResults.Problem("User not found", statusCode: 404);

        var now = DateTime.UtcNow;
        switch (req.Code.ToLower())
        {
            case "favs":
                currentUser.Prefs.Favs = new UserPrefsItems(items, now);
                break;
            case "speedruns":
                currentUser.Prefs.SpeedRuns = new UserPrefsItems(items, now);
                break;
            default:
                return TypedResults.Problem("Invalid prefs code", statusCode: 400);
        }
        await db.SaveChangesAsync();
        return TypedResults.Ok(new UserPrefsItems(items, now));
    }

    public record StatusResp(int Id, string Username, string AvatarUrl, bool IsActive, string Youtube, string Twitch);

    public record UserListItem(
        int Id, string Username, string Email, string AvatarUrl, DateTime LastLoginAt,
        string DiscordId, string SteamId, string AltName, bool IsActive);

    public record ProfileReq(string Username, string? Youtube, string? Twitch);

    public record ProfileResp(
        int Id, string Username, string Email, string DiscordId, string AvatarUrl,
        string Youtube, string Twitch, string SteamId, string AltName, string ObsSecretCode,
        string[] Roles);

    public record ObsCodeResp(string ObsSecretCode);

    public record ProfileStats(
        int PublicCreated, int PrivateCreated,
        int PublicPlayedIn, int PrivatePlayedIn,
        int TrophiesLogged, int BestScore);

    public record FeedbackReq(string Page, string Msg);

    public record PrefsItemsReq(string Code, string[] Items);

    const int MaxItemsPerSection = 1000;
    const int MaxItemCodeLen = 64;
    const int MaxFeedbackEntries = 50;
}
