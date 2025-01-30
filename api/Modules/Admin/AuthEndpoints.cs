using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Admin;

public static class AuthEndpoints
{
  public static void MapAuthEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("api/auth");
    
    api.MapGet("discord", async (HttpContext ctx) =>
    {
      await ctx.ChallengeAsync("Discord");
    });

    api.MapPost("logout", async (HttpContext ctx) =>
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

  public record ProfileReq(string Username, string? Youtube, string? Twitch);
}