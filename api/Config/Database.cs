using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.Config;
public static class Database
{
  public static void AddDatabase(this WebApplicationBuilder builder)
  {
    builder.Services.AddDbContextPool<AppDbContext>(options =>
    {
      var cs = builder.Configuration.GetConnectionString("valhelp");
      options.UseSnakeCaseNamingConvention();
      options.UseNpgsql(cs, o => 
      {
        //o.ConfigureDataSource(b => b.EnableDynamicJson());
      });
    });
  }
}