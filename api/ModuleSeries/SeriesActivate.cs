using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.ModuleSeries;

public static class SeriesActivate
{
    public static void MapEndpointsSeries(this WebApplication app)
    {
        //app.MapSeriesEndpoints();
    }

    public static void OnModelCreating(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Season>(entity =>
        {
            entity.HasKey(e => e.Code);

            entity.OwnsMany(x => x.ScoreItems, x => x.ToJson());
            entity.OwnsMany(x => x.Admins, x => x.ToJson());

            // ToJson() goes on the outermost owned type only — nested owned types are
            // part of the same document automatically. EF 10 rejects nested ToJson()
            // calls outright (they were already no-ops: the seasons table has no
            // achievements/events columns, the data lives inside stats/schedule).
            entity.OwnsOne(e => e.Stats, stats =>
            {
                stats.ToJson();
                stats.OwnsMany(s => s.Achievements);
            });
            entity.OwnsOne(e => e.Schedule, schedule =>
            {
                schedule.ToJson();
                schedule.OwnsMany(s => s.Events);
            });

            entity.HasMany(e => e.Events)
                .WithOne(x => x.Season)
                .HasForeignKey(x => x.SeasonCode);
        });
    }
}
