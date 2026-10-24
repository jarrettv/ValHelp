using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleWorlds;

public static class WorldsActivate
{
    public static void MapEndpointsWorlds(this WebApplication app)
    {
        WorldsEndpoints.Map(app);
        WorldsPoiConfig.Map(app);
        WorldsPublic.Map(app);
    }

    public static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PoiSetting>().HasKey(s => s.Prefab);
        modelBuilder.Entity<PoiIcon>().HasKey(i => i.Name);
        modelBuilder.Entity<AltBiomeSetting>().HasKey(s => s.Name);
        modelBuilder.Entity<PoiSetting>().Ignore(s => s.HasMapOverride);
        modelBuilder.Entity<PoiSetting>().Property(s => s.Contents)
            .HasColumnType("jsonb")
            .HasConversion(AppDbContext.CreateDictionaryConverter<bool>(), new ValueComparer<Dictionary<string, bool>>(
                (a, b) => a!.Count == b!.Count && !a.Except(b).Any(),
                c => c.Aggregate(0, (h, kv) => HashCode.Combine(h, kv.Key.GetHashCode(), kv.Value)),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));
        modelBuilder.Entity<PublicWorld>().HasKey(w => w.Seed);
    }
}
