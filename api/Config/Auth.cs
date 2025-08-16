using AspNet.Security.OAuth.Discord;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;
using ValHelpApi.Modules.Admin;

namespace ValHelpApi.Config;

public static class Auth
{
  public static void AddAuth(this WebApplicationBuilder builder)
  {
    builder.Services.AddAuthentication(options =>
    {
      options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    })
      .AddCookie()
      .AddDiscord(options =>
      {
        options.ClientId = builder.Configuration["DISCORD_OAUTH_CLIENT_ID"]!;
        options.ClientSecret = builder.Configuration["DISCORD_OAUTH_CLIENT_SECRET"]!;
        options.Events.OnCreatingTicket = async context =>
        {
          var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
          var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>();

          var discordUser = context.Principal!;
          var discordId = discordUser.FindFirstValue(ClaimTypes.NameIdentifier);
          
          var avatarHash = discordUser.FindFirstValue(DiscordAuthenticationConstants.Claims.AvatarHash)!;
          var avatarUrl = $"https://cdn.discordapp.com/avatars/{discordId}/{avatarHash}.webp?size=240";
          avatarUrl = await DownloadAvatar(logger, db, avatarUrl);

          var user = await db.Users.SingleOrDefaultAsync(u => u.DiscordId == discordId);
          if (user == null)
          {
            user = new User
            {
              DiscordId = discordUser.FindFirstValue(ClaimTypes.NameIdentifier)!,
              Username = discordUser.FindFirstValue(ClaimTypes.Name)!,
              Email = discordUser.FindFirstValue(ClaimTypes.Email) ?? $"{discordUser.FindFirstValue(ClaimTypes.Name)}@valheim.help",
              AvatarUrl = avatarUrl,
              CreatedAt = DateTime.UtcNow,
              UpdatedAt = DateTime.UtcNow,
              IsActive = true,
            };
            db.Users.Add(user);
            logger.LogInformation("Creating new user {DiscordId}", user.DiscordId);
          }

          if (!user.IsActive)
          {
            logger.LogWarning("Inactive user trying to login {DiscordId}", user.DiscordId);
            context.Fail("User is not active");
            return;
          }

          user.AvatarUrl = avatarUrl;
          user.LastLoginAt = DateTime.UtcNow;
          await db.SaveChangesAsync();
          logger.LogInformation("User {DiscordId} logged in", user.DiscordId);

          var claims = new List<Claim>
          {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new("DiscordId", user.DiscordId),
            new("AvatarUrl", user.AvatarUrl)
          };
          foreach (var role in user.Roles)
          {
            claims.Add(new Claim(ClaimTypes.Role, role));
          }
          var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
          var principal = new ClaimsPrincipal(identity);
          await context.HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
          context.Success();
        };
        options.Events.OnTicketReceived = context =>
        {
          context.Response.Redirect("/?auth=success");
          context.HandleResponse();
          return Task.CompletedTask;
        };
      });

    builder.Services.AddAuthorization(options =>
    {
      options.AddPolicy("Admin", policy => policy.RequireRole("admin"));
    });
  }

  private static async Task<string> DownloadAvatar(ILogger logger, AppDbContext db, string avatarUrl)
  {
    using var httpClient = new HttpClient();
    try
    {
      var avatarBytes = await httpClient.GetByteArrayAsync(avatarUrl);
      var hash = MD5.HashData(avatarBytes);
      var hashString = Convert.ToHexStringLower(hash);

      var avatar = await db.Avatars.SingleOrDefaultAsync(a => a.Hash == hashString);
      if (avatar == null)
      {
        avatar = new Avatar
        {
          Hash = hashString,
          ContentType = "image/webp",
          Data = avatarBytes,
          UploadedAt = DateTime.UtcNow
        };
        db.Avatars.Add(avatar);
        await db.SaveChangesAsync();
        logger.LogInformation("Stored new avatar with hash {Hash}", hashString);
      }
      else
      {
        logger.LogInformation("Avatar with hash {Hash} already exists, reusing", hashString);
      }
      return $"https://valheim.help/api/avatar/{hashString}.webp";
    }
    catch (Exception ex)
    {
      logger.LogWarning(ex, "Failed to download or store avatar url={AvatarUrl}", avatarUrl);
    }
    return avatarUrl;
  }
}