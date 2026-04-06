using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using OpenTelemetry.Trace;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;

namespace ValHelpApi.ModuleTrack;
public class TrackLogTracker(Tracer tracer, ILogger<TrackLogTracker> logger,
  Channel<TrackLog> channel, IServiceScopeFactory factory, PathStore pathStore) : BackgroundService
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

        var liveEvents = await db.Events
          .Where(h => h.Status == EventStatus.Live)
          .Where(h => h.Seed == log.Seed)
          .Select(h => new { h.Id, h.StartAt })
          .ToArrayAsync(stoppingToken);

        if (liveEvents.Length == 0)
        {
            logger.LogDebug("Process log no live event for seed={seed}", log.Seed);
            return;
        }

        if (liveEvents.Length > 1)
        {
            logger.LogWarning("Process log multiple live events for seed={seed}", log.Seed);
        }

        var liveEventIds = liveEvents.Select(e => e.Id).ToArray();
        var eventStartAt = liveEvents[0].StartAt;
        
        // Feed path data to PathStore for live SSE streaming
        foreach (var entry in log.Logs)
        {
            if (CompactEventParser.IsCompactFormat(entry.Code))
            {
                var events = CompactEventParser.Parse(entry.Code);
                var points = events
                    .Select(e => new PathStore.PathPoint(e.Secs, e.X, e.Z, e.Tag == 'J'))
                    .ToArray();
                if (points.Length > 0)
                    pathStore.AddPathPoints(log.Seed, log.Id, points);
            }
            else if (entry.Code.StartsWith("Path="))
            {
                var points = ParsePathCode(entry.Code);
                if (points.Length > 0)
                    pathStore.AddPathPoints(log.Seed, log.Id, points);
            }
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

        player.Update(log, eventStartAt);
        await db.SaveChangesAsync(stoppingToken);

        var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
        await cache.RemoveAsync($"event-{player.EventId}", stoppingToken);
    }

    /// <summary>Parse "Path=0:142,32,-87;8:155,32,-91;..." into PathPoints.</summary>
    private static PathStore.PathPoint[] ParsePathCode(string code)
    {
        var data = code.AsSpan(5); // skip "Path="
        var points = new List<PathStore.PathPoint>();
        foreach (var seg in data.ToString().Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var colonIdx = seg.IndexOf(':');
            if (colonIdx < 0) continue;
            if (!int.TryParse(seg.AsSpan(0, colonIdx), out var t)) continue;
            var coords = seg[(colonIdx + 1)..].Split(',');
            if (coords.Length != 3) continue;
            if (int.TryParse(coords[0], out var x) && int.TryParse(coords[2], out var z))
                points.Add(new PathStore.PathPoint(t, x, z));
        }
        return points.ToArray();
    }
}
