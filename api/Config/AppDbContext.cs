using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleEvents;
using ValHelpApi.ModuleSeries;
using ValHelpApi.ModuleStuff;
using ValHelpApi.ModuleTrack;

namespace ValHelpApi.Config;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Avatar> Avatars { get; set; }
    public DbSet<Scoring> Scorings { get; set; }

    public DbSet<Event> Events { get; set; }
    public DbSet<Player> Players { get; set; }

    public DbSet<Season> Seasons { get; set; }

    public DbSet<TrackHunt> TrackHunts { get; set; }
    public DbSet<TrackLog> TrackLogs { get; set; }

    public DbSet<Hunt> Hunts { get; set; }
    public DbSet<HuntsPlayer> HuntsPlayers { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        AdminActivate.OnModelCreating(modelBuilder);
        EventsActivate.OnModelCreating(modelBuilder);
        SeriesActivate.OnModelCreating(modelBuilder);
        StuffActivate.OnModelCreating(modelBuilder);
        TrackActivate.OnModelCreating(modelBuilder);
    }


    public static ValueConverter<Dictionary<string, T>, string> CreateDictionaryConverter<T>()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        return new ValueConverter<Dictionary<string, T>, string>(
            v => JsonSerializer.Serialize(v, options),
            v => JsonSerializer.Deserialize<Dictionary<string, T>>(v, options) ?? new Dictionary<string, T>());
    }
    public static ValueComparer<string[]> CreateStringArrayComparer()
    {
        return new ValueComparer<string[]>(
            (c1, c2) => c1!.SequenceEqual(c2!),
            c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
            c => c.ToArray());
    }

    
}
