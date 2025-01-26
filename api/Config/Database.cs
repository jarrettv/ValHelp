using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.Config;
public static class Database
{
  public static void AddDatabase(this WebApplicationBuilder builder)
  {
    builder.AddNpgsqlDbContext<AppDbContext>("valhelp", null, options => options.UseSnakeCaseNamingConvention());
  }
}