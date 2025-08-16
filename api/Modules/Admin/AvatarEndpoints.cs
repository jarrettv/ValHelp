using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.Config;

public static class AvatarEndpoints
{
    public static void MapAvatarEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("api/avatar");

        api.MapGet("{hash}.webp", GetAvatar);
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
}
