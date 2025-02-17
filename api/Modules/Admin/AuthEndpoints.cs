using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Admin;

public static class AuthEndpoints
{
  public static void MapAuthEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/auth");

    api.MapGet("status", async (ClaimsPrincipal user, AppDbContext db) =>
    {
      var none = new { Id = 0, Username = "", AvatarUrl = "", IsActive = false };
      if (user.Identity?.IsAuthenticated == true)
      {
        var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var currentUser = await db.Users
          .Where(u => u.Id == userId)
          .Select(x => new { x.Id, x.Username, x.AvatarUrl, x.IsActive })
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

    api.MapPost("users", PostUsers).RequireAuthorization("Admin");

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
        if (!Uri.IsWellFormedUriString(req.Youtube, UriKind.Absolute))
        {
          return TypedResults.Problem("Invalid Youtube URL", statusCode: 400);
        }
        if (!req.Youtube.Contains("youtube.com"))
        {
          return TypedResults.Problem("Invalid Youtube URL", statusCode: 400);
        }
        currentUser.Youtube = req.Youtube.Trim();
      }
      else
      {
        currentUser.Youtube = "";
      }

      if (!string.IsNullOrWhiteSpace(req.Twitch))
      {
        if (!Uri.IsWellFormedUriString(req.Twitch, UriKind.Absolute))
        {
          return TypedResults.Problem("Invalid Twitch URL", statusCode: 400);
        }
        if (!req.Twitch.Contains("twitch.tv"))
        {
          return TypedResults.Problem("Invalid Twitch URL", statusCode: 400);
        }
        currentUser.Twitch = req.Twitch.Trim();
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


  public static async Task<Results<Ok, BadRequest>> PostUsers(HttpRequest request, AppDbContext db, ILoggerFactory logger)
  {
    var log = logger.CreateLogger("PostUsers");

    try
    {
      using var reader = new StreamReader(request.Body);
      var csvData = await reader.ReadToEndAsync();
      var alts = CsvHelper.ParseCsv(csvData, new UserAltsMap());
      foreach (var alt in alts)
      {
        var user = await db.Users.SingleOrDefaultAsync(u => u.DiscordId == alt.DiscordId);
        if (user == null)
        {
          log.LogInformation("User {discordId} not found, creating new user", alt.DiscordId);
          user = new User
          {
            Username = alt.Username,
            Email = $"{alt.Username.ToLower()}@valheim.help",
            DiscordId = alt.DiscordId,
            AvatarUrl = "https://valheim.help/favicon.webp",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            IsActive = true,
          };
        }

        if (user.Username != alt.Username)
        {
          log.LogWarning("User {discordId} has a different username ({oldUsername} -> {newUsername})", alt.DiscordId, user.Username, alt.Username);
        }

        user.AltName = alt.AltName;
        user.SteamId = alt.SteamId;
        db.Users.Update(user);

        log.LogInformation("User {discordId} updated with alt name {altName} and steam id {steamId}", alt.DiscordId, alt.AltName, alt.SteamId);
      }

      await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
      log.LogError(ex, "Error updating alts");
      return TypedResults.BadRequest();
    }
    return TypedResults.Ok();
  }


  public record ProfileReq(string Username, string? Youtube, string? Twitch);

}