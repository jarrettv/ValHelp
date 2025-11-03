using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using OpenTelemetry.Trace;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleTrack;

// this is legacy hunt tracker for old calls from mod client
public class TrackHuntTracker(Tracer tracer, ILogger<TrackHuntTracker> logger, Channel<TrackHunt> channel, IServiceScopeFactory factory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(3000, stoppingToken);

        logger.LogInformation($"{nameof(TrackHuntTracker)} channel is now reading");
        await foreach (var hunt in channel.Reader.ReadAllAsync(stoppingToken))
        {
            using (var scope = factory.CreateScope()) // Create a new DI scope
            {
                using var span = tracer.StartActiveSpan("ProcessHunt");
                span.SetAttribute("hunt.at", hunt.CreatedAt.ToString("O"));
                span.SetAttribute("hunt.id", hunt.PlayerId ?? hunt.PlayerName);
                span.SetAttribute("hunt.seed", hunt.SessionId);
                try
                {
                    await ProcessHunt(scope, hunt, stoppingToken);
                }
                catch (Exception ex)
                {
                    span.SetStatus(Status.Error.WithDescription(ex.Message));
                    logger.LogError(ex, "Process hunt failed at {time} for {id}", hunt.CreatedAt, hunt.PlayerId);
                }
            }
        }
        logger.LogInformation($"{nameof(TrackHuntTracker)} is stopping");
    }

    private async Task ProcessHunt(IServiceScope scope, TrackHunt hunt, CancellationToken stoppingToken)
    {
        logger.LogInformation("Process hunt at {time} for {id}", hunt.CreatedAt, hunt.PlayerId);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.TrackHunts.Add(hunt);
        await db.SaveChangesAsync(stoppingToken);

        int? liveEventId = await db.Events
          .Where(h => h.Status == EventStatus.Live)
          .Where(h => h.Seed == hunt.SessionId)
          .Where(h => h.Mode == hunt.Gamemode)
          .Select(h => h.Id)
          .FirstOrDefaultAsync(stoppingToken);

        if (liveEventId == null)
        {
            logger.LogDebug("Process hunt no live event for seed={seed} and mode={mode}", hunt.SessionId, hunt.Gamemode);
            return;
        }

        var player = await db.Players
          .Where(hp => hp.EventId == liveEventId)
          .Where(hp => hp.User.DiscordId == hunt.PlayerId || hp.User.SteamId == hunt.PlayerName)
          .FirstOrDefaultAsync(stoppingToken);

        if (player == null)
        {
            logger.LogDebug("Process hunt no player for {user}={id} and event={eventId}", hunt.PlayerName, hunt.PlayerId, liveEventId);
            return;
        }

        player.Update(hunt.CreatedAt, hunt.CurrentScore, hunt.Trophies.Split(','), hunt.Deaths, hunt.Logouts);
        await db.SaveChangesAsync(stoppingToken);

        var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
        await cache.RemoveAsync($"event-{liveEventId}", stoppingToken);
    }
}
