using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public class SeedMaker : BackgroundService
{
  private readonly ILogger<SeedMaker> _logger;
  private readonly IServiceScopeFactory _serviceProvider;
  private readonly TimeSpan _updateInterval = TimeSpan.FromMinutes(1); // Adjust the interval as needed

  public SeedMaker(ILogger<SeedMaker> logger, IServiceScopeFactory serviceProvider)
  {
    _logger = logger;
    _serviceProvider = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation("SeedMaker is now making seeds");

    while (!stoppingToken.IsCancellationRequested)
    {
      await UpdateEventSeeds();
      await Task.Delay(_updateInterval, stoppingToken);
    }

    _logger.LogInformation("SeedMaker is stopping");
  }

  private async Task UpdateEventSeeds()
  {
    _logger.LogDebug("UpdateEventSeeds");
    using (var scope = _serviceProvider.CreateScope())
    {
      var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
      var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
      var fiveMinutesToGo = DateTime.UtcNow.AddMinutes(5);
      var events = await db.Events
        .Where(h => h.Status == EventStatus.New || h.Status == EventStatus.Live)
        .Where(h => h.Seed == "(random)")
        .Where(h => fiveMinutesToGo > h.StartAt)
        .ToListAsync();
      
      foreach (var ev in events)
      {
        var abbr = ev.Mode switch
        {
          "TrophyHunt" => "hunt",
          "TrophySaga" => "saga",
          "TrophyRush" => "rush",
          _ => "run"
        };
        ev.Seed = $"{abbr}{RandomString(6)}";
        ev.UpdatedAt = DateTime.UtcNow;
        _logger.LogInformation("Event {eventId} has a new random seed {seed}", ev.Id, ev.Seed);
        await db.SaveChangesAsync();
        await cache.RemoveAsync($"event-{ev.Id}");
      }
    }
  }

  private static string RandomString(int length)
  {
    // TODO: prevent bad words
    const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var random = new Random();
    return new string(Enumerable.Repeat(chars, length)
      .Select(s => s[random.Next(s.Length)]).ToArray());
  }
}