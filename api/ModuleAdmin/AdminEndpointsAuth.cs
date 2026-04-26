using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsAuth
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/auth");

        api.MapGet("status", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var none = new { Id = 0, Username = "", AvatarUrl = "", IsActive = false, Youtube = "", Twitch = "" };
            if (user.Identity?.IsAuthenticated == true)
            {
                var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
                var currentUser = await db.Users
                    .Where(u => u.Id == userId)
                    .Select(x => new { x.Id, x.Username, x.AvatarUrl, x.IsActive, x.Youtube, x.Twitch })
                    .SingleOrDefaultAsync() ?? none;
                return TypedResults.Ok(currentUser);
            }
            return TypedResults.Ok(none);
        });

        api.MapGet("users", async (AppDbContext db) =>
        {
            var users = await db.Users
                .Select(x => new { x.Id, x.Username, x.Email, x.AvatarUrl, x.LastLoginAt, x.DiscordId, x.SteamId, x.AltName, x.IsActive })
                .ToListAsync();
            return TypedResults.Ok(users);
        }).RequireAuthorization("Admin");

        api.MapGet("discord", async (HttpContext ctx) =>
        {
            await ctx.ChallengeAsync("Discord");
        });

        api.MapGet("logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync();
            ctx.Response.Redirect("/");
        });

        api.MapGet("profile", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var profile = await db.Users
                .Where(u => u.Id == userId)
                .Select(u => new ProfileResp(u.Id, u.Username, u.Email, u.DiscordId, u.AvatarUrl, u.Youtube, u.Twitch, u.SteamId, u.AltName, u.ObsSecretCode))
                .SingleAsync();
            return TypedResults.Ok(profile);
        }).RequireAuthorization();

        api.MapPost("profile", async Task<Results<Ok<ProfileResp>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, ProfileReq req) =>
        {
            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
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
                currentUser.Youtube, currentUser.Twitch, currentUser.SteamId, currentUser.AltName, currentUser.ObsSecretCode));
        }).RequireAuthorization();
    
        api.MapPost("feedback", async Task<Results<Ok, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, FeedbackReq req) =>
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

            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
            if (currentUser == null) return TypedResults.Problem("User not found", statusCode: 404);

            var existing = currentUser.Prefs.Feedback ?? [];
            var kept = existing.Count >= MaxFeedbackEntries
                ? existing[(existing.Count - MaxFeedbackEntries + 1)..]
                : existing;
            currentUser.Prefs.Feedback = [.. kept, new UserPrefsFeedback(page, msg, DateTime.UtcNow)];
            await db.SaveChangesAsync();
            return TypedResults.Ok();
        }).RequireAuthorization();
    
        api.MapGet("prefs/{code}", async Task<Results<Ok<UserPrefsItems>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, string code) =>
        {
            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
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
        });
    
        api.MapPost("prefs", async Task<Results<Ok<UserPrefsItems>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, PrefsItemsReq req) =>
        {
            
            if (req.Items.Length > MaxItemsPerSection) return TypedResults.Problem($"Too many items (max {MaxItemsPerSection})", statusCode: 400);
            foreach (var s in req.Items)
            {
                if (string.IsNullOrWhiteSpace(s) || s.Length > MaxItemCodeLen)
                    return TypedResults.Problem("Invalid item code", statusCode: 400);
            }

            var items = req.Items.Distinct(StringComparer.Ordinal).ToArray();

            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
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
        });
    
    }

    public record ProfileReq(string Username, string? Youtube, string? Twitch);

    public record ProfileResp(
        int Id, string Username, string Email, string DiscordId, string AvatarUrl,
        string Youtube, string Twitch, string SteamId, string AltName, string ObsSecretCode);


    public record FeedbackReq(string Page, string Msg);

    public record PrefsItemsReq(string Code, string[] Items);

    const int MaxItemsPerSection = 1000;
    const int MaxItemCodeLen = 64;
    const int MaxFeedbackEntries = 50;
}
