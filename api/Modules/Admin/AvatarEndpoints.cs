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
        var idToAvatarMap = new Dictionary<int, string>();

        var allUsers = await db.Users
            .ToListAsync();
        foreach (var user in allUsers)
        {
            if (user.AvatarUrl.StartsWith("https://valheim.help/api/avatar"))
            {
                logger.LogInformation("User {UserId} already has mapped avatar URL {AvatarUrl}", user.Id, user.AvatarUrl);
                idToAvatarMap[user.Id] = user.AvatarUrl;
                continue;
            }
            else if (user.AvatarUrl == "https://valheim.help/favicon.webp")
            {
                logger.LogInformation("User {UserId} doesn't have a good avatar", user.Id);
                continue;
            }

            var newUrl = await Auth.DownloadAvatar(logger, db, user.AvatarUrl);
            user.AvatarUrl = newUrl;
            await db.SaveChangesAsync();

            if (newUrl != "https://valheim.help/favicon.webp")
            {
                idToAvatarMap[user.Id] = newUrl;
            }
        }

        var allPlayers = await db.Players
            .Where(x => x.AvatarUrl.StartsWith("https://cdn.discordapp.com/avatars/"))
            .ToListAsync();
        foreach (var player in allPlayers)
        {
            if (idToAvatarMap.ContainsKey(player.UserId))
            {
                logger.LogInformation("Player {PlayerId} already has a good avatar URL {AvatarUrl}", player.UserId, player.AvatarUrl);
                player.AvatarUrl = idToAvatarMap[player.UserId];
                await db.SaveChangesAsync();
                continue;
            }

            var newUrl = await Auth.DownloadAvatar(logger, db, player.AvatarUrl);
            player.AvatarUrl = newUrl;
            await db.SaveChangesAsync();
        }

        return TypedResults.Ok(idToAvatarMap.Select(x => $"{x.Key}={x.Value}").ToArray());
    }
}
