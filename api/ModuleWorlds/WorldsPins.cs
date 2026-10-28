using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;

namespace ValHelpApi.ModuleWorlds;

/// <summary>
/// Worlds a logged-in user pinned so they follow them to other browsers. Only
/// the seed is kept (in the user's prefs): each browser generates the world
/// itself the first time and caches it (web/src/worldgen/localWorlds.ts).
///
///   GET    api/worlds/pins          the user's pinned seeds, oldest first
///   PUT    api/worlds/pins          pin one ({ seed }); at most <see cref="Limit"/>
///   DELETE api/worlds/pins/{seed}   unpin one
/// </summary>
public static class WorldsPins
{
    /// <summary>Pinned worlds per account (may grow for premium users).</summary>
    public const int Limit = 4;

    static readonly Regex SeedPattern = new(@"^\S.{0,63}$", RegexOptions.Compiled);

    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/worlds/pins").RequireAuthorization();
        api.MapGet("", GetPins);
        api.MapPut("", PutPin);
        api.MapDelete("{seed}", DeletePin);
    }

    static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record PinsResp(UserPrefsPin[] Pins, int Limit);
    public record PinReq(string Seed);

    public static async Task<Ok<PinsResp>> GetPins(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var prefs = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Prefs).SingleOrDefaultAsync();
        return TypedResults.Ok(new PinsResp([.. prefs?.PinnedWorlds ?? []], Limit));
    }

    public static async Task<Results<Ok<PinsResp>, ProblemHttpResult>> PutPin(ClaimsPrincipal user, AppDbContext db, PinReq req)
    {
        var seed = (req.Seed ?? "").Trim();
        if (!SeedPattern.IsMatch(seed)) return TypedResults.Problem("Invalid seed", statusCode: 400);
        var userId = UserId(user);
        var current = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (current == null) return TypedResults.Problem("User not found", statusCode: 404);
        var pins = current.Prefs.PinnedWorlds ?? [];
        if (!pins.Any(p => p.Seed == seed))
        {
            if (pins.Count >= Limit) return TypedResults.Problem($"You can pin up to {Limit} worlds", statusCode: 409);
            current.Prefs.PinnedWorlds = [.. pins, new UserPrefsPin(seed, DateTime.UtcNow)];
            await db.SaveChangesAsync();
        }
        return TypedResults.Ok(new PinsResp([.. current.Prefs.PinnedWorlds ?? pins], Limit));
    }

    public static async Task<Results<Ok<PinsResp>, ProblemHttpResult>> DeletePin(ClaimsPrincipal user, AppDbContext db, string seed)
    {
        var userId = UserId(user);
        var current = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (current == null) return TypedResults.Problem("User not found", statusCode: 404);
        var pins = current.Prefs.PinnedWorlds ?? [];
        if (pins.Any(p => p.Seed == seed))
        {
            current.Prefs.PinnedWorlds = pins.Where(p => p.Seed != seed).ToList();
            await db.SaveChangesAsync();
        }
        return TypedResults.Ok(new PinsResp([.. current.Prefs.PinnedWorlds ?? []], Limit));
    }
}
