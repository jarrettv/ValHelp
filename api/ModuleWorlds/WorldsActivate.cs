using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.ModuleWorlds;

public static class WorldsActivate
{
    public static void MapEndpointsWorlds(this WebApplication app)
    {
        WorldsEndpoints.Map(app);
        WorldsPoiConfig.Map(app);
    }

    public static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PoiSetting>().HasKey(s => s.Prefab);
        modelBuilder.Entity<PoiIcon>().HasKey(i => i.Name);
    }
}
