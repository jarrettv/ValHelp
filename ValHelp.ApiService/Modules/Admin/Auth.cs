using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace ValHelp.ApiService.Modules.Admin;

public static class Auth
{
    public static void AddAuth(this WebApplicationBuilder builder)
    {
      builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(jwtOptions =>
        {
          jwtOptions.Authority = "https://{--your-authority--}";
          jwtOptions.Audience = "https://{--your-audience--}";
        });
    }
}