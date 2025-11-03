using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.ModuleSeries;

public static class SeriesActivate
{
    public static void OnModelCreating(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Season>(entity =>
        {
            entity.HasKey(e => e.Code);

            entity.OwnsMany(x => x.ScoreItems, x => x.ToJson());
            entity.OwnsMany(x => x.Admins, x => x.ToJson());

            entity.OwnsOne(e => e.Stats, stats =>
            {
                stats.ToJson();
                stats.OwnsMany(s => s.Achievements, achievements => achievements.ToJson());
            });
            entity.OwnsOne(e => e.Schedule, schedule =>
            {
                schedule.ToJson();
                schedule.OwnsMany(s => s.Events, events => events.ToJson());
            });

            entity.HasMany(e => e.Events)
                .WithOne(x => x.Season)
                .HasForeignKey(x => x.SeasonCode);
        });
    }
}
