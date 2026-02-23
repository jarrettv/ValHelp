using Microsoft.EntityFrameworkCore;
using ValHelpApi.ModuleAdmin;

namespace ValHelpApi.ModuleRuns;

public static class RunsActivate
{
    public static void MapEndpointsRuns(this WebApplication app)
    {
        RunsEndpoints.Map(app);
    }

    public static void OnModelCreating(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Run>()
            .HasOne(r => r.Owner)
            .WithMany()
            .HasForeignKey(r => r.OwnerId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Run>()
            .OwnsMany(r => r.Events, b => b.ToJson());

        modelBuilder.Entity<Run>()
            .OwnsOne(r => r.Record, b => b.ToJson());
    }
}
