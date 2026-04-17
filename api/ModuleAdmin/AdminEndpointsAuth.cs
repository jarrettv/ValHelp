using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsAuth
{
    internal static void Map(WebApplication app)
    {
        MapPrefs(app);
        MapFeedback(app);
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

        //api.MapPost("users", PostUsers).RequireAuthorization("Admin");

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
            var currentUser = await db.Users
          .Where(u => u.Id == userId)
          .SingleAsync();
            return TypedResults.Ok(currentUser);
        }).RequireAuthorization();

        api.MapPost("profile", async Task<Results<Ok<User>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, ProfileReq req) =>
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
            return TypedResults.Ok(currentUser);
        }).RequireAuthorization();
    }


    // public static async Task<Results<Ok, BadRequest>> PostUsers(HttpRequest request, AppDbContext db, ILoggerFactory logger)
    // {
    //   var log = logger.CreateLogger("PostUsers");

    //   try
    //   {
    //     using var reader = new StreamReader(request.Body);
    //     var csvData = await reader.ReadToEndAsync();
    //     var alts = CsvHelper.ParseCsv(csvData, new UserAltsMap());
    //     foreach (var alt in alts)
    //     {
    //       var user = await db.Users.SingleOrDefaultAsync(u => u.DiscordId == alt.DiscordId);
    //       if (user == null)
    //       {
    //         log.LogInformation("User {discordId} not found, creating new user", alt.DiscordId);
    //         user = new User
    //         {
    //           Username = alt.Username,
    //           Email = $"{alt.Username.ToLower()}@valheim.help",
    //           DiscordId = alt.DiscordId,
    //           AvatarUrl = "https://valheim.help/favicon.webp",
    //           CreatedAt = DateTime.UtcNow,
    //           UpdatedAt = DateTime.UtcNow,
    //           LastLoginAt = DateTime.UtcNow,
    //           IsActive = true,
    //         };
    //       }

    //       if (user.Username != alt.Username)
    //       {
    //         log.LogWarning("User {discordId} has a different username ({oldUsername} -> {newUsername})", alt.DiscordId, user.Username, alt.Username);
    //       }

    //       user.AltName = alt.AltName;
    //       user.SteamId = alt.SteamId;
    //       db.Users.Update(user);

    //       log.LogInformation("User {discordId} updated with alt name {altName} and steam id {steamId}", alt.DiscordId, alt.AltName, alt.SteamId);
    //     }

    //     await db.SaveChangesAsync();
    //   }
    //   catch (Exception ex)
    //   {
    //     log.LogError(ex, "Error updating alts");
    //     return TypedResults.BadRequest();
    //   }
    //   return TypedResults.Ok();
    // }


    public record ProfileReq(string Username, string? Youtube, string? Twitch);

    public record FeedbackReq(string? Page, string? Msg);

    internal static void MapFeedback(WebApplication app)
    {
        var api = app.MapGroup("api/auth");

        // POST /api/auth/feedback — appends to user's prefs.feedback array.
        // Stored as { at: ISO-UTC, page: relative-path, msg: text }.
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

            var raw = string.IsNullOrWhiteSpace(currentUser.Prefs) ? "{}" : currentUser.Prefs;
            var node = JsonNode.Parse(raw) as JsonObject ?? new JsonObject();
            if (node["feedback"] is not JsonArray arr) { arr = new JsonArray(); node["feedback"] = arr; }

            // Cap history at 50 entries per user to bound growth.
            while (arr.Count >= 50) arr.RemoveAt(0);

            arr.Add(new JsonObject
            {
                ["at"] = DateTime.UtcNow.ToString("o"),
                ["page"] = page,
                ["msg"] = msg,
            });

            var serialized = node.ToJsonString();
            if (serialized.Length > 64 * 1024)
            {
                return TypedResults.Problem("Prefs storage exceeds size limit", statusCode: 400);
            }
            currentUser.Prefs = serialized;
            await db.SaveChangesAsync();
            return TypedResults.Ok();
        }).RequireAuthorization();
    }

    internal static void MapPrefs(WebApplication app)
    {
        var api = app.MapGroup("api/auth");

        // GET /api/auth/prefs — returns the user's prefs bag.
        api.MapGet("prefs", async Task<Results<Ok<JsonElement>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var raw = await db.Users
              .Where(u => u.Id == userId)
              .Select(u => u.Prefs)
              .SingleOrDefaultAsync();
            if (raw == null) return TypedResults.Problem("User not found", statusCode: 404);

            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
            return TypedResults.Ok(doc.RootElement.Clone());
        }).RequireAuthorization();

        // PUT /api/auth/prefs — shallow-merges top-level keys from the body into the
        // stored prefs bag. Keys not present in the body are preserved (e.g. feedback,
        // which is written server-side and never sent by the client).
        // Per-section timestamps live inside the JSON (e.g. prefs.favs.at) so clients
        // can implement their own conflict resolution without extra columns.
        api.MapPut("prefs", async Task<Results<Ok<JsonElement>, ProblemHttpResult>> (ClaimsPrincipal user, AppDbContext db, JsonElement body) =>
        {
            var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var currentUser = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
            if (currentUser == null) return TypedResults.Problem("User not found", statusCode: 404);

            if (body.ValueKind != JsonValueKind.Object)
            {
                return TypedResults.Problem("Prefs must be a JSON object", statusCode: 400);
            }

            var raw = string.IsNullOrWhiteSpace(currentUser.Prefs) ? "{}" : currentUser.Prefs;
            var merged = JsonNode.Parse(raw) as JsonObject ?? new JsonObject();
            foreach (var prop in body.EnumerateObject())
            {
                merged[prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
            }

            var serialized = merged.ToJsonString();
            if (serialized.Length > 64 * 1024)
            {
                return TypedResults.Problem("Prefs too large (max 64KB)", statusCode: 400);
            }

            currentUser.Prefs = serialized;
            await db.SaveChangesAsync();

            using var doc = JsonDocument.Parse(currentUser.Prefs);
            return TypedResults.Ok(doc.RootElement.Clone());
        }).RequireAuthorization();
    }
}
