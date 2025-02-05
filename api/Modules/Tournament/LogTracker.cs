using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Trace;
using ValHelpApi.Config;

namespace ValHelpApi.Modules.Tournament;
public class LogTracker : BackgroundService
{
  private readonly Tracer _tracer;
  private readonly ILogger<LogTracker> _logger;
  private readonly Channel<TrackLog> _channel;
  private readonly IServiceScopeFactory _serviceScopeFactory;

  public LogTracker(Tracer tracer, ILogger<LogTracker> logger, Channel<TrackLog> channel, IServiceScopeFactory serviceProvider)
  {
    _tracer = tracer;
    _logger = logger;
    _channel = channel;
    _serviceScopeFactory = serviceProvider;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    await Task.Delay(3000, stoppingToken);

    _logger.LogInformation("Tracker channel is now reading");
    await foreach (var log in _channel.Reader.ReadAllAsync(stoppingToken))
    {
      using (var scope = _serviceScopeFactory.CreateScope()) // Create a new DI scope
      {
        using var span = _tracer.StartActiveSpan("ProcessLog");
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
          _logger.LogError(ex, "Process log failed at {time} for {id}", log.At, log.Id);
        }
      }
    }
    _logger.LogInformation("Tracker is stopping");
  }

  private async Task ProcessLog(IServiceScope scope, TrackLog log, CancellationToken stoppingToken)
  {
    _logger.LogInformation("Process log at {time} for {id}", log.At, log.Id);
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.TrackLogs.Add(log);
    await db.SaveChangesAsync(stoppingToken);

    int? liveEventId = await db.Events
      .Where(h => h.Status == EventStatus.Live)
      .Where(h => h.Seed == log.Seed)
      .Select(h => h.Id)
      .FirstOrDefaultAsync(stoppingToken);

    if (liveEventId == null)
    {
      _logger.LogDebug("Process log no live event for seed={seed}", log.Seed);
      return;
    }

    var player = await db.Players
      .Where(hp => hp.EventId == liveEventId)
      .Where(hp => hp.User.DiscordId == log.Id)
      .FirstOrDefaultAsync(stoppingToken);

    if (player == null)
    {
      _logger.LogDebug("Process log no player for {user}={id} and event={eventId}", log.User, log.Id, liveEventId);
      return;
    }

    player.Update(log);
    await db.SaveChangesAsync(stoppingToken);
  }
}