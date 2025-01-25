using System.Data.Common;
using Azure.Core;
using Azure.Identity;
using Microsoft.EntityFrameworkCore;

namespace ValHelp.ApiService.Config;
public static class Database
{
  public static void AddDatabase(this WebApplicationBuilder builder)
  {
    builder.AddNpgsqlDbContext<AppDbContext>("valhelp");
    // builder.AddNpgsqlDataSource("valhelp", configureDataSourceBuilder: (dataSourceBuilder) =>
    // {
    //   if (!string.IsNullOrEmpty(dataSourceBuilder.ConnectionStringBuilder.Password))
    //   {
    //     return;
    //   }

    //   dataSourceBuilder.UsePeriodicPasswordProvider(async (_, ct) =>
    //       {
    //       var credentials = new DefaultAzureCredential();
    //       var token = await credentials.GetTokenAsync(
    //               new TokenRequestContext([
    //                   "https://ossrdbms-aad.database.windows.net/.default"
    //               ]), ct);

    //       return token.Token;
    //     },
    //       TimeSpan.FromHours(24),
    //       TimeSpan.FromSeconds(10));
    // });

    // builder.Services.AddDbContext<AppDbContext>((services, options) =>
    //     options.UseNpgsql(services.GetRequiredService<DbDataSource>()!)
    // );
  }
}