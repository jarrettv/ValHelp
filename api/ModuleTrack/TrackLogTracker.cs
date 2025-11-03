using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using OpenTelemetry.Trace;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleTrack;
public class TrackLogTracker(Tracer tracer, ILogger<TrackLogTracker> logger,
  Channel<TrackLog> channel, IServiceScopeFactory factory) : BackgroundService
{

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(3000, stoppingToken);

        logger.LogInformation($"{nameof(TrackLogTracker)} channel is now reading");
        await foreach (var log in channel.Reader.ReadAllAsync(stoppingToken))
        {
            using var scope = factory.CreateScope(); // Create a new DI scope
            using var span = tracer.StartActiveSpan("ProcessLog");
            span.SetAttribute("log.at", log.At.ToString("O"));
            span.SetAttribute("log.id", log.Id);
            span.SetAttribute("log.seed", log.Seed);
            try
            {
                await ProcessLog(scope, log, stoppingToken);
            }
            catch (Exception ex)
            {
                span.SetStatus(Status.Error.WithDescription(ex.Message));
                logger.LogError(ex, "Process log failed at {time} for {id}", log.At, log.Id);
            }
        }
        logger.LogInformation($"{nameof(TrackLogTracker)} is stopping");
    }

    private async Task ProcessLog(IServiceScope scope, TrackLog log, CancellationToken stoppingToken)
    {
        logger.LogInformation("Process log at {time} for {id}", log.At, log.Id);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.TrackLogs.Add(log);
        await db.SaveChangesAsync(stoppingToken);

        int[] liveEventIds = await db.Events
          .Where(h => h.Status == EventStatus.Live)
          .Where(h => h.Seed == log.Seed)
          .Select(h => h.Id)
          .ToArrayAsync(stoppingToken);

        if (liveEventIds.Length == 0)
        {
            logger.LogDebug("Process log no live event for seed={seed}", log.Seed);
            return;
        }

        if (liveEventIds.Length > 1)
        {
            logger.LogWarning("Process log multiple live events for seed={seed}", log.Seed);
        }

        var player = await db.Players
          .Where(hp => liveEventIds.Contains(hp.EventId))
          .Where(hp => hp.User.DiscordId == log.Id)
          .FirstOrDefaultAsync(stoppingToken);

        if (player == null)
        {
            logger.LogDebug("Process log no player for {user}={id} and seed={seed}", log.User, log.Id, log.Seed);
            return;
        }

        player.Update(log);
        await db.SaveChangesAsync(stoppingToken);

        var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
        await cache.RemoveAsync($"event-{player.EventId}", stoppingToken);
    }
}
