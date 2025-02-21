using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using OpenTelemetry.Trace;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;
public class HuntTracker : BackgroundService
{
  private readonly Tracer _tracer;
  private readonly ILogger<HuntTracker> _logger;
  private readonly Channel<TrackHunt> _channel;
  private readonly IServiceScopeFactory _serviceScopeFactory;

  public HuntTracker(Tracer tracer, ILogger<HuntTracker> logger, Channel<TrackHunt> channel, IServiceScopeFactory serviceProvider)
  {
    _tracer = tracer;
    _logger = logger;
    _channel = channel;
    _serviceScopeFactory = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation($"{nameof(HuntTracker)} channel is now reading");
    await foreach (var hunt in _channel.Reader.ReadAllAsync(stoppingToken))
    {
      using (var scope = _serviceScopeFactory.CreateScope()) // Create a new DI scope
      {
        using var span = _tracer.StartActiveSpan("ProcessHunt");
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
          _logger.LogError(ex, "Process hunt failed at {time} for {id}", hunt.CreatedAt, hunt.PlayerId);
        }
      }
    }
    _logger.LogInformation($"{nameof(HuntTracker)} is stopping");
  }

  private async Task ProcessHunt(IServiceScope scope, TrackHunt hunt, CancellationToken stoppingToken)
  {
    _logger.LogInformation("Process hunt at {time} for {id}", hunt.CreatedAt, hunt.PlayerId);
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
      _logger.LogDebug("Process hunt no live event for seed={seed} and mode={mode}", hunt.SessionId, hunt.Gamemode);
      return;
    }

    var player = await db.Players
      .Where(hp => hp.EventId == liveEventId)
      .Where(hp => hp.User.DiscordId == hunt.PlayerId || hp.User.SteamId == hunt.PlayerName)
      .FirstOrDefaultAsync(stoppingToken);

    if (player == null)
    {
      _logger.LogDebug("Process hunt no player for {user}={id} and event={eventId}", hunt.PlayerName, hunt.PlayerId, liveEventId);
      return;
    }

    player.Update(hunt.CreatedAt, hunt.CurrentScore, hunt.Trophies.Split(','), hunt.Deaths, hunt.Logouts);
    await db.SaveChangesAsync(stoppingToken);
    
    var cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
    await cache.RemoveAsync($"event-{liveEventId}");
  }
}