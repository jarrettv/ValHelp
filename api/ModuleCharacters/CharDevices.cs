using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
/// Pairs a native watcher with a site account (device authorization flow, RFC 8628 style):
///
///   POST   api/char/device/start     anonymous — watcher gets a device code + a user code to show
///   POST   api/char/device/approve   logged in — user confirms the user code on /link
///   POST   api/char/device/token     anonymous — watcher polls with its device code; gets a token once
///   GET    api/char/devices          logged in — the user's paired watchers
///   DELETE api/char/devices/{id}     logged in — revoke one
///
/// The token is shown once; only its SHA-256 is stored. Watchers send it as
/// "Authorization: Bearer ..." (see <see cref="Authenticate"/>).
/// </summary>
public static class CharDevices
{
    static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(10);
    const int PollIntervalSeconds = 5;
    // No 0/O, 1/I/L: read off a tray app and typed on a phone.
    const string UserCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/char");
        api.MapPost("device/start", Start);
        api.MapPost("device/approve", Approve).RequireAuthorization();
        api.MapPost("device/token", Token);
        api.MapGet("devices", List).RequireAuthorization();
        api.MapDelete("devices/{id:long}", Revoke).RequireAuthorization();
    }

    static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static string HashToken(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    static string RandomToken() => Base64Url(RandomNumberGenerator.GetBytes(32));

    static string Base64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    static string RandomUserCode()
    {
        Span<char> c = stackalloc char[9];
        for (int i = 0; i < 9; i++)
            c[i] = i == 4 ? '-' : UserCodeAlphabet[RandomNumberGenerator.GetInt32(UserCodeAlphabet.Length)];
        return new string(c);
    }

    static string NormalizeUserCode(string? code)
    {
        var s = new string((code ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        return s.Length == 8 ? s[..4] + "-" + s[4..] : s;
    }

    public record StartReq(string? Name);
    public record StartResp(string DeviceCode, string UserCode, string VerifyUrl, int ExpiresIn, int Interval);

    public static async Task<Ok<StartResp>> Start(AppDbContext db, HttpContext ctx, StartReq? req)
    {
        var now = DateTime.UtcNow;
        // Expired links are only ever read by their own watcher; sweep them here.
        await db.Set<CharDeviceLink>().Where(l => l.ExpiresAt < now.AddHours(-1)).ExecuteDeleteAsync();

        var name = (req?.Name ?? "").Trim();
        if (name.Length == 0) name = "Valheim watcher";
        if (name.Length > 64) name = name[..64];
        var link = new CharDeviceLink
        {
            DeviceCode = RandomToken(),
            UserCode = RandomUserCode(),
            DeviceName = name,
            CreatedAt = now,
            ExpiresAt = now + LinkLifetime,
        };
        db.Add(link);
        await db.SaveChangesAsync();

        var verifyUrl = $"{ctx.Request.Scheme}://{ctx.Request.Host}/link?code={link.UserCode}";
        return TypedResults.Ok(new StartResp(link.DeviceCode, link.UserCode, verifyUrl,
            (int)LinkLifetime.TotalSeconds, PollIntervalSeconds));
    }

    public record ApproveReq(string UserCode);
    public record ApproveResp(string DeviceName);

    public static async Task<Results<Ok<ApproveResp>, NotFound<string>>> Approve(
        ClaimsPrincipal user, AppDbContext db, ApproveReq req)
    {
        var code = NormalizeUserCode(req.UserCode);
        var now = DateTime.UtcNow;
        var link = await db.Set<CharDeviceLink>()
            .SingleOrDefaultAsync(l => l.UserCode == code && l.ExpiresAt > now && l.ApprovedAt == null);
        if (link == null) return TypedResults.NotFound("That code is unknown or expired. Restart pairing in the app.");
        link.UserId = UserId(user);
        link.ApprovedAt = now;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new ApproveResp(link.DeviceName));
    }

    public record TokenReq(string DeviceCode);
    /// <summary>Status is "pending", "expired" or "approved" (token set, returned once).</summary>
    public record TokenResp(string Status, string? Token);

    public static async Task<Ok<TokenResp>> Token(AppDbContext db, TokenReq req)
    {
        var now = DateTime.UtcNow;
        var link = await db.Set<CharDeviceLink>().SingleOrDefaultAsync(l => l.DeviceCode == req.DeviceCode);
        if (link == null || link.ClaimedAt != null || link.ExpiresAt <= now && link.ApprovedAt == null)
            return TypedResults.Ok(new TokenResp("expired", null));
        if (link.ApprovedAt == null || link.UserId == null)
            return TypedResults.Ok(new TokenResp("pending", null));

        var token = RandomToken();
        db.Add(new CharDevice
        {
            UserId = link.UserId.Value,
            Name = link.DeviceName,
            TokenHash = HashToken(token),
            CreatedAt = now,
            LastSeenAt = now,
        });
        link.ClaimedAt = now;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new TokenResp("approved", token));
    }

    public record DeviceItem(long Id, string Name, DateTime CreatedAt, DateTime LastSeenAt);

    public static async Task<Ok<DeviceItem[]>> List(ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var items = await db.Set<CharDevice>().AsNoTracking()
            .Where(d => d.UserId == userId && d.RevokedAt == null)
            .OrderByDescending(d => d.LastSeenAt)
            .Select(d => new DeviceItem(d.Id, d.Name, d.CreatedAt, d.LastSeenAt))
            .ToArrayAsync();
        return TypedResults.Ok(items);
    }

    public static async Task<Results<NoContent, NotFound>> Revoke(long id, ClaimsPrincipal user, AppDbContext db)
    {
        var userId = UserId(user);
        var n = await db.Set<CharDevice>()
            .Where(d => d.Id == id && d.UserId == userId && d.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.RevokedAt, DateTime.UtcNow));
        return n == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
    }

    /// <summary>The device behind a watcher's bearer token, or null.</summary>
    public static async Task<CharDevice?> Authenticate(HttpContext ctx, AppDbContext db)
    {
        var header = ctx.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.Ordinal)) return null;
        var hash = HashToken(header["Bearer ".Length..].Trim());
        var device = await db.Set<CharDevice>().SingleOrDefaultAsync(d => d.TokenHash == hash && d.RevokedAt == null);
        if (device == null) return null;
        var user = await db.Users.AsNoTracking().Where(u => u.Id == device.UserId).Select(u => new { u.IsActive }).SingleOrDefaultAsync();
        if (user is not { IsActive: true }) return null;
        device.LastSeenAt = DateTime.UtcNow;
        return device;
    }
}
