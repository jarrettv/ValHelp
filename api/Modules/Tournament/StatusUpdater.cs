using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;

public class StatusUpdater : BackgroundService
{
  private readonly ILogger<StatusUpdater> _logger;
  private readonly IServiceScopeFactory _serviceProvider;
  private readonly TimeSpan _updateInterval = TimeSpan.FromMinutes(1); // Adjust the interval as needed

  public StatusUpdater(ILogger<StatusUpdater> logger, IServiceScopeFactory serviceProvider)
  {
    _logger = logger;
    _serviceProvider = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation("StatusUpdater is now updating statuses");

    while (!stoppingToken.IsCancellationRequested)
    {
      await UpdateEventStatuses();
      await Task.Delay(_updateInterval, stoppingToken);
    }

    _logger.LogInformation("StatusUpdater is stopping");
  }

  private async Task UpdateEventStatuses()
  {
    _logger.LogDebug("UpdateEventStatuses");
    using (var scope = _serviceProvider.CreateScope())
    {
      var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
      var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
      var hunts = await db.Events
        .Where(h => h.Status < EventStatus.Over && h.Status >= EventStatus.New)
        .ToListAsync();
      
      foreach (var hunt in hunts)
      {
        if (hunt.Status == EventStatus.Live && hunt.EndAt < DateTime.UtcNow)
        {
          hunt.Status = EventStatus.Over;
          _logger.LogInformation("Event {eventId} is now over", hunt.Id);
          await db.SaveChangesAsync();
          await cache.RemoveAsync($"event-{hunt.Id}");
        }
        else if (hunt.Status == EventStatus.New && hunt.StartAt < DateTime.UtcNow)
        {
          hunt.Status = EventStatus.Live;
          _logger.LogInformation("Event {eventId} is now live", hunt.Id);
          await db.SaveChangesAsync();
          await cache.RemoveAsync($"event-{hunt.Id}");
        }
        else
        {
          _logger.LogDebug("Event {eventId} status is unchanged", hunt.Id);
        }
      }
    }
  }
}