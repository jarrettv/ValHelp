using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsPrivateEvents
{
    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/admin/private-events").RequireAuthorization();
        api.MapGet("", List);
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    public static async Task<Results<Ok<List<PrivateEventEntry>>, ForbidHttpResult>> List(
        ClaimsPrincipal user, AppDbContext db)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();

        var rows = await db.Events
            .AsNoTracking()
            .Where(e => e.IsPrivate && e.Status != EventStatus.Deleted)
            .OrderByDescending(e => e.StartAt)
            .Select(e => new PrivateEventEntry(
                e.Id,
                e.Name,
                e.Mode,
                (int)e.Status,
                e.StartAt,
                e.EndAt,
                e.Hours,
                e.OwnerId,
                e.Owner.Username,
                e.Owner.AvatarUrl,
                e.PrivatePassword,
                e.Players.Count,
                e.CreatedAt))
            .ToListAsync();

        return TypedResults.Ok(rows);
    }

    public record PrivateEventEntry(
        int Id, string Name, string Mode, int Status,
        DateTime StartAt, DateTime EndAt, float Hours,
        int OwnerId, string OwnerUsername, string OwnerAvatarUrl,
        string? PrivatePassword, int PlayerCount, DateTime CreatedAt);
}
