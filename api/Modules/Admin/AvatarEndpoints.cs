using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.Config;

public static class AvatarEndpoints
{
    public static void MapAvatarEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("api/avatar");

        api.MapGet("{hash}.webp", GetAvatar);

        api.MapPost("load-all", LoadAllAvatars);
    }

    public static async Task<Results<FileContentHttpResult, NotFound>> GetAvatar(HttpContext ctx, AppDbContext db, string hash)
    {
        var avatar = await db.Avatars
            .Where(a => a.Hash == hash)
            .OrderByDescending(a => a.UploadedAt)
            .FirstOrDefaultAsync();

        if (avatar == null)
        {
            return TypedResults.NotFound();
        }

        ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return TypedResults.File(avatar.Data, avatar.ContentType);
    }

    public static async Task<Ok<string[]>> LoadAllAvatars(ILoggerFactory log, AppDbContext db)
    {
        var logger = log.CreateLogger("AvatarLoader");
        var oldToNewMap = new Dictionary<string, string>();

        var allUsers = await db.Users
            .Where(x => x.AvatarUrl.StartsWith("https://cdn.discordapp.com/avatars/"))
            .ToListAsync();
        foreach (var user in allUsers)
        {
            if (oldToNewMap.ContainsKey(user.AvatarUrl))
            {
                logger.LogInformation("User {UserId} already has mapped avatar URL {AvatarUrl}", user.Id, user.AvatarUrl);
                user.AvatarUrl = oldToNewMap[user.AvatarUrl];
                await db.SaveChangesAsync();
                continue;
            }

            var newUrl = await Auth.DownloadAvatar(logger, db, user.AvatarUrl);
            oldToNewMap[user.AvatarUrl] = newUrl;
            user.AvatarUrl = newUrl;
            await db.SaveChangesAsync();
        }

        var allPlayers = await db.Players
            .Where(x => x.AvatarUrl.StartsWith("https://cdn.discordapp.com/avatars/"))
            .ToListAsync();
        foreach (var player in allPlayers)
        {
            if (oldToNewMap.ContainsKey(player.AvatarUrl))
            {
                logger.LogInformation("Player {PlayerId} already has mapped avatar URL {AvatarUrl}", player.UserId, player.AvatarUrl);
                player.AvatarUrl = oldToNewMap[player.AvatarUrl];
                await db.SaveChangesAsync();
                continue;
            }

            var newUrl = await Auth.DownloadAvatar(logger, db, player.AvatarUrl);
            oldToNewMap[player.AvatarUrl] = newUrl;
            player.AvatarUrl = newUrl;
            await db.SaveChangesAsync();
        }

        return TypedResults.Ok(oldToNewMap.Select(x => $"{x.Key}={x.Value}").ToArray());
    }
}
