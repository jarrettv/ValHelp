using Microsoft.EntityFrameworkCore;
using ValHelp.ApiService.Modules.Tournament;

namespace ValHelp.ApiService.Config;

public class AppDbContext : DbContext
{
  public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
  {
  }

  protected override void OnModelCreating(ModelBuilder modelBuilder)
  {
    modelBuilder.Entity<Hunt>()
      .Property(h => h.Scoring)
      .HasColumnType("jsonb");

    modelBuilder.Entity<Hunt>()
      .Property(h => h.Prizes)
      .HasColumnType("jsonb");

    modelBuilder.Entity<HuntPlayer>()
      .ToTable("hunts_player")
      .HasKey(hp => new { hp.HuntId, hp.PlayerId });
    modelBuilder.Entity<HuntPlayer>()
      .Property(hp => hp.Trophies)
      .HasColumnType("jsonb");

    modelBuilder.Entity<TrackHunt>()
      .ToTable("track_hunt");
    modelBuilder.Entity<TrackHunt>()
      .Property(th => th.Trophies)
      .HasColumnType("jsonb");

    base.OnModelCreating(modelBuilder);
  }

  public DbSet<Hunt> Hunts { get; set; }
  public DbSet<HuntPlayer> HuntPlayers { get; set; }
  public DbSet<TrackHunt> TrackHunts { get; set; }
}

public static class StringExtensions
{
  public static string ToSnakeCase(this string input)
  {
    if (string.IsNullOrEmpty(input)) { return input; }

    var startUnderscores = System.Text.RegularExpressions.Regex.Match(input, @"^_+");
    return startUnderscores + System.Text.RegularExpressions.Regex.Replace(input, @"([a-z0-9])([A-Z])", "$1_$2").ToLower();
  }
}
