using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ValHelpApi.Config;
public static class Database
{
    public static void AddDatabase(this WebApplicationBuilder builder)
    {
        builder.Services.AddDbContextPool<AppDbContext>(options =>
        {
            var cs = builder.Configuration.GetConnectionString("valhelp");
            options.UseSnakeCaseNamingConvention();
            options.UseNpgsql(cs);
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.MultipleCollectionIncludeWarning));
        });
    }
}
