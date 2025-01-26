using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
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


    modelBuilder.Entity<Hunt>()
      .Property(h => h.Scoring)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<int>(), new ValueComparer<Dictionary<string, int>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

    modelBuilder.Entity<Hunt>()
      .Property(h => h.Prizes)
      .HasColumnType("jsonb")
            .HasConversion(CreateDictionaryConverter<string>(), new ValueComparer<Dictionary<string, string>>(
                (c1, c2) => c1!.SequenceEqual(c2!),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

    modelBuilder.Entity<HuntPlayer>()
      .ToTable("hunts_player")
      .HasKey(hp => new { hp.HuntId, hp.PlayerId });

    modelBuilder.Entity<TrackHunt>();

  }

  public DbSet<Hunt> Hunts { get; set; }
  public DbSet<HuntPlayer> HuntPlayers { get; set; }
  public DbSet<TrackHunt> TrackHunts { get; set; }


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
