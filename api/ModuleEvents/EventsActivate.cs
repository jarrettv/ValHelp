using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleEvents;

public static class EventsActivate
{
    public static void MapEndpointsEvents(this WebApplication app)
    {
        EventsEndpointsEvent.Map(app);
        EventsEndpointsImport.Map(app);
        EventsEndpointsPlayer.Map(app);
    }

    public static void OnModelCreating(this ModelBuilder modelBuilder)
    {

        modelBuilder.Entity<Event>()
        .Property(h => h.Prizes)
        .HasColumnType("jsonb")
                .HasConversion(AppDbContext.CreateDictionaryConverter<string>(), new ValueComparer<Dictionary<string, string>>(
                    (c1, c2) => c1!.SequenceEqual(c2!),
                    c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                    c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

        modelBuilder.Entity<Event>()
        .HasOne(e => e.Owner)
        .WithMany()
        .HasForeignKey(e => e.OwnerId)
        .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Player>()
        .HasKey(hp => new { hp.EventId, hp.UserId });

        modelBuilder.Entity<Player>()
        .OwnsMany(x => x.Logs, x => x.ToJson());

        modelBuilder.Entity<Player>()
        .Property(x => x.Version)
        .IsRowVersion();
    }
}
