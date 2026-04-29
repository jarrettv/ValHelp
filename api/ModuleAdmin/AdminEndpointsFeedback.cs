using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsFeedback
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/admin").RequireAuthorization();
        api.MapGet("feedback", List);
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    public static async Task<Results<Ok<List<FeedbackEntry>>, ForbidHttpResult>> List(
        ClaimsPrincipal user, AppDbContext db)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();

        // Prefs is stored as JSON; EF disallows projecting JSON-owned types
        // in a tracked query, so use AsNoTracking and flatten in memory.
        var users = await db.Users
            .AsNoTracking()
            .Select(u => new { u.Id, u.Username, u.AvatarUrl, u.Prefs })
            .ToListAsync();

        var entries = users
            .SelectMany(u => (u.Prefs?.Feedback ?? new List<UserPrefsFeedback>())
                .Select(f => new FeedbackEntry(u.Id, u.Username, u.AvatarUrl, f.Page, f.Msg, f.At)))
            .OrderByDescending(e => e.At)
            .ToList();

        return TypedResults.Ok(entries);
    }

    public record FeedbackEntry(
        int UserId, string Username, string AvatarUrl, string Page, string Msg, DateTime At);
}
