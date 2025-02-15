using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ValHelpApi.Modules.Admin;
using ValHelpApi.Modules.Tournament;

namespace ValHelpApi.Config;

public class AppDbContext : DbContext
{
  public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
  {
  }

  protected override void OnModelCreating(ModelBuilder modelBuilder)
  {
    base.OnModelCreating(modelBuilder);

    modelBuilder.Entity<Scoring>()
      .HasKey(h => h.Code);

    modelBuilder.Entity<Scoring>()
      .Property(h => h.Scores)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<int>(), new ValueComparer<Dictionary<string, int>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

    modelBuilder.Entity<Event>()
      .Property(h => h.Prizes)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<string>(), new ValueComparer<Dictionary<string, string>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

    modelBuilder.Entity<Player>()
      .HasKey(hp => new { hp.EventId, hp.UserId });
    
    modelBuilder.Entity<Player>()
      .OwnsMany(x => x.Logs, x => x.ToJson());

    modelBuilder.Entity<TrackLog>()
      .HasKey(h => new { h.At, h.Id });

    modelBuilder.Entity<TrackLog>()
      .OwnsMany(x => x.Logs, x => x.ToJson());

    modelBuilder.Entity<User>()
      .HasIndex(u => u.DiscordId)
      .IsUnique();
    
    
    modelBuilder.Entity<Hunt>()
      .Property(h => h.Prizes)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<string>(), new ValueComparer<Dictionary<string, string>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));
    modelBuilder.Entity<Hunt>()
      .Property(h => h.Scoring)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<int>(), new ValueComparer<Dictionary<string, int>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

    modelBuilder.Entity<HuntsPlayer>()
      .HasKey(hp => new { hp.HuntId, hp.PlayerId });
    
    modelBuilder.Entity<HuntsPlayer>()
      .OwnsMany(x => x.Trophies, x => x.ToJson());
  }

  public DbSet<Event> Events { get; set; }
  public DbSet<Player> Players { get; set; }
  public DbSet<Hunt> Hunts { get; set; }
  public DbSet<HuntsPlayer> HuntsPlayers { get; set; }
  public DbSet<TrackHunt> TrackHunts { get; set; }
  public DbSet<TrackLog> TrackLogs { get; set; }

  public DbSet<User> Users { get; set; }
  public DbSet<Scoring> Scorings { get; set; }

  private static ValueConverter<Dictionary<string, T>, string> CreateDictionaryConverter<T>()
  {
    var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    return new ValueConverter<Dictionary<string, T>, string>(
        v => JsonSerializer.Serialize(v, options),
        v => JsonSerializer.Deserialize<Dictionary<string, T>>(v, options) ?? new Dictionary<string, T>());
  }
  private static ValueComparer<string[]> CreateStringArrayComparer()
  {
    return new ValueComparer<string[]>(
        (c1, c2) => c1!.SequenceEqual(c2!),
        c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
        c => c.ToArray());
  }
}
