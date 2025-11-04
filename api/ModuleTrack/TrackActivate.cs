using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleTrack;

public static class TrackActivate
{
    public static void MapEndpointsTrack(this WebApplication app)
    {
        TrackEndpoints.Map(app);
    }

    public static void OnModelCreating(this ModelBuilder modelBuilder)
    {
        
        modelBuilder.Entity<TrackLog>()
        .HasKey(h => new { h.At, h.Id });

        modelBuilder.Entity<TrackLog>()
        .OwnsMany(x => x.Logs, x => x.ToJson());

        modelBuilder.Entity<Hunt>()
            .Property(h => h.Prizes)
            .HasColumnType("jsonb")
            .HasConversion(AppDbContext.CreateDictionaryConverter<string>(), new ValueComparer<Dictionary<string, string>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));
        modelBuilder.Entity<Hunt>()
            .Property(h => h.Scoring)
            .HasColumnType("jsonb")
            .HasConversion(AppDbContext.CreateDictionaryConverter<int>(), new ValueComparer<Dictionary<string, int>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

        modelBuilder.Entity<HuntsPlayer>()
            .ToTable("hunts_player")
            .HasKey(hp => new { hp.HuntId, hp.PlayerId });
    }
}
