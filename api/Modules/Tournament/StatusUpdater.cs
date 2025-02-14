using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public class StatusUpdater : BackgroundService
{
  private readonly ILogger<StatusUpdater> _logger;
  private readonly IServiceScopeFactory _serviceProvider;
  private readonly TimeSpan _updateInterval = TimeSpan.FromSeconds(60); // Adjust the interval as needed
  private readonly ConcurrentDictionary<int, DateTime> _scheduledEvents = new();

  public StatusUpdater(ILogger<StatusUpdater> logger, IServiceScopeFactory serviceProvider)
  {
    _logger = logger;
    _serviceProvider = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation($"{nameof(StatusUpdater)} is now updating statuses");

    _ = Task.Run(() => SchedulerLoop(stoppingToken), stoppingToken);

    while (!stoppingToken.IsCancellationRequested)
    {
      await UpdateEventStatuses();
      await Task.Delay(_updateInterval, stoppingToken);
    }

    _logger.LogInformation($"{nameof(StatusUpdater)} is stopping");
  }

  private async Task UpdateEventStatuses()
  {
    _logger.LogDebug("UpdateEventStatuses");
    using var scope = _serviceProvider.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var soon = DateTime.UtcNow.AddMinutes(5);
    var eventsNeedingStatusUpdate = await db.Events
      .AsNoTracking()
      .Where(h => (h.Status == EventStatus.New && soon > h.StartAt) || (h.Status == EventStatus.Live && soon > h.EndAt))
      .Select(x => new { x.Id, x.StartAt, x.EndAt, x.Status })
      .ToListAsync();

    foreach (var ev in eventsNeedingStatusUpdate)
    {
      DateTime eventTime;
      if (ev.Status == EventStatus.New && ev.StartAt <= soon)
      {
        eventTime = ev.StartAt;
      }
      else if (ev.Status == EventStatus.Live && ev.EndAt <= soon)
      {
        eventTime = ev.EndAt;
      }
      else
      {
        continue;
      }

      _ = _scheduledEvents.AddOrUpdate(ev.Id, eventTime, (key, oldValue) => eventTime);
      _logger.LogDebug("Event {eventId} needs a status update at {time}", ev.Id, eventTime);
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
        await OnStatusUpdate(eventId, stoppingToken);
      }

      await Task.Delay(1000, stoppingToken); // Check every second
    }
  }

  private async Task OnStatusUpdate(int eventId, CancellationToken stoppingToken)
  {
    _logger.LogDebug("OnStatusUpdate for event {eventId}", eventId);
    using var scope = _serviceProvider.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();

    var hunt = await db.Events
      .Where(h => h.Id == eventId)
      .Where(h => h.Status < EventStatus.Over && h.Status >= EventStatus.New)
      .SingleOrDefaultAsync(stoppingToken);

    if (hunt == null)
    {
      _logger.LogWarning("Event {eventId} status no longer needs updating", eventId);
      return;
    }

    if (hunt.Status == EventStatus.New && hunt.StartAt <= DateTime.UtcNow)
    {
      hunt.Status = EventStatus.Live;
      hunt.UpdatedAt = DateTime.UtcNow;
      _logger.LogInformation("Event {eventId} is now live", eventId);
    }
    else if (hunt.Status == EventStatus.Live && hunt.EndAt <= DateTime.UtcNow)
    {
      hunt.Status = EventStatus.Over;
      hunt.UpdatedAt = DateTime.UtcNow;
      _logger.LogInformation("Event {eventId} is now over", eventId);
    }

    await db.SaveChangesAsync(stoppingToken);
    await cache.RemoveAsync($"event-{eventId}");
  }
}