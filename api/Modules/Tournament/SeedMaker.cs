using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public class SeedMaker : BackgroundService
{
  private readonly ILogger<SeedMaker> _logger;
  private readonly IServiceScopeFactory _serviceProvider;
  private readonly TimeSpan _updateInterval = TimeSpan.FromSeconds(60); // Adjust the interval as needed
  private readonly ConcurrentDictionary<int, DateTime> _scheduledEvents = new();

  public SeedMaker(ILogger<SeedMaker> logger, IServiceScopeFactory serviceProvider)
  {
    _logger = logger;
    _serviceProvider = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation($"{nameof(SeedMaker)} is now making seeds");

    // this loop allows us to be accurate down to the second
    _ = Task.Run(() => SchedulerLoop(stoppingToken), stoppingToken);

    // this loop gets the events that need random seeds from the database
    while (!stoppingToken.IsCancellationRequested)
    {
      await GetEventSeeds();
      await Task.Delay(_updateInterval, stoppingToken);
    }

    _logger.LogInformation($"{nameof(SeedMaker)} is stopping");
  }

  private async Task GetEventSeeds()
  {
    _logger.LogDebug("UpdateEventSeeds");
    using var scope = _serviceProvider.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var soon = DateTime.UtcNow.AddMinutes(10);
    var eventsNeedingRandomSeed = await db.Events
      .AsNoTracking()
      .Where(h => h.Status == EventStatus.New || h.Status == EventStatus.Live)
      .Where(h => h.Seed == "(random)")        
      .Where(h => soon > h.StartAt)
      .Select(x => new { x.Id, x.StartAt})
      .ToListAsync();

    foreach (var ev in eventsNeedingRandomSeed)
    {
      var eventSeedTime = ev.StartAt.AddMinutes(-5); // 5 minutes before the event starts
      // add or update with the latest time
      _ = _scheduledEvents.AddOrUpdate(ev.Id, eventSeedTime, (key, oldValue) => eventSeedTime);
      _logger.LogDebug("Event {eventId} needs a random seed at {time}", ev.Id, eventSeedTime);
    }
  }

  private async Task SchedulerLoop(CancellationToken stoppingToken)
  {
    while (!stoppingToken.IsCancellationRequested)
    {
      var now = DateTime.UtcNow;
      var eventsToProcess = _scheduledEvents
        .Where(kvp => kvp.Value <= now)
        .Select(kvp => kvp.Key)
        .ToList();

      foreach (var eventId in eventsToProcess)
      {
        _scheduledEvents.TryRemove(eventId, out _);
        await OnSeedSchedule(eventId, stoppingToken);
      }

      await Task.Delay(1000, stoppingToken); // Check every second
    }
  }

  private async Task OnSeedSchedule(int eventId, CancellationToken stoppingToken)
  {
    _logger.LogDebug("OnSeedSchedule for event {eventId}", eventId);
    using var scope = _serviceProvider.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();

    var hunt = await db.Events
      .Where(h => h.Id == eventId)
      .Where(h => h.Status == EventStatus.New || h.Status == EventStatus.Live)
      .Where(h => h.Seed == "(random)")
      .SingleOrDefaultAsync(stoppingToken);

    if (hunt == null)
    {
      _logger.LogWarning("Event {eventId} must have changed", eventId);
      return;
    }
    
    var abbr = hunt.Mode switch
    {
      "TrophyHunt" => "hunt",
      "TrophySaga" => "saga",
      "TrophyRush" => "rush",
      "TrophyBlitz" => "bltz",
      _ => "run"
    };

    if (abbr == "saga")
    {
      var random = new Random();
      var index = random.Next(1, 6); // Random index between 1 and 5
      hunt.Seed = $"{RandomString(index)}{abbr}{RandomString(6 - index)}";
    }
    else
    {
      hunt.Seed = $"{abbr}{RandomString(6)}";
    }
    
    hunt.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync(stoppingToken);
    await cache.RemoveAsync($"event-{eventId}");
  }

  private static string RandomString(int length)
  {
    // TODO: prevent bad words
    const string chars = "ABCDEFGHJKLMNPQRTUVWXYZ23456789";
    var random = new Random();
    return new string(Enumerable.Repeat(chars, length)
      .Select(s => s[random.Next(s.Length)]).ToArray());
  }
}