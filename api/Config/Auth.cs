using AspNet.Security.OAuth.Discord;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
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

          var user = await db.Users.SingleOrDefaultAsync(u => u.DiscordId == discordId);
          if (user == null)
          {
            user = new User
            {
              DiscordId = discordUser.FindFirstValue(ClaimTypes.NameIdentifier)!,
              Username = discordUser.FindFirstValue(ClaimTypes.Name)!,
              Email = discordUser.FindFirstValue(ClaimTypes.Email)!,
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

          var avatarHash = discordUser.FindFirstValue(DiscordAuthenticationConstants.Claims.AvatarHash)!;
          user.AvatarUrl = $"https://cdn.discordapp.com/avatars/{discordId}/{avatarHash}.webp?size=240";
          user.LastLoginAt = DateTime.UtcNow;
          await db.SaveChangesAsync();
          logger.LogInformation("User {DiscordId} logged in", user.DiscordId);          

          var claims = new List<Claim>
          {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim("DiscordId", user.DiscordId),
            new Claim("AvatarUrl", user.AvatarUrl)
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
}