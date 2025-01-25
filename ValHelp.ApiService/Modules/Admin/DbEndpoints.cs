using Microsoft.EntityFrameworkCore;
using ValHelp.ApiService.Config;

namespace ValHelp.ApiService.Modules.Admin;
public static class DbEndpoints
{
  public static void MapDbEndpoints(this WebApplication app)
  {
    var api = app.MapGroup("admin/db");
    api.MapGet("migrate", async (AppDbContext db) =>
    {
      await db.Database.MigrateAsync();
      return Results.Ok("Database migrated");
    });
  }
}