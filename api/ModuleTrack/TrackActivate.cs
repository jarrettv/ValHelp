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

        modelBuilder.Entity<TrackMap>()
        .HasKey(m => m.Seed);

    }
}
