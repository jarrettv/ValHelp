using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;

namespace ValHelpApi.ModuleTrack;

/// <summary>
/// In-memory store of player paths during live events.
/// Fed by TrackLogTracker when Path= codes arrive.
/// SSE connections subscribe for real-time updates.
/// </summary>
public class PathStore
{
    private readonly ConcurrentDictionary<string, SeedState> _seeds = new();

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    // ── Data structures ──

    public record PathPoint(int T, int X, int Z);

    public record PathEvent(string Type, string PlayerId, object Data);

    private class SeedState
    {
        public readonly ConcurrentDictionary<string, PlayerPath> Players = new();
        public readonly List<ChannelWriter<PathEvent>> Subscribers = new();
        public readonly Lock SubLock = new();
    }

    private class PlayerPath
    {
        public readonly List<PathPoint> Points = new();
        public readonly Lock PointsLock = new();
    }

    // ── Called by TrackLogTracker ──

    public void AddPathPoints(string seed, string playerId, PathPoint[] points)
    {
        var state = _seeds.GetOrAdd(seed, _ => new SeedState());
        var player = state.Players.GetOrAdd(playerId, _ => new PlayerPath());

        lock (player.PointsLock)
        {
            player.Points.AddRange(points);
        }

        Broadcast(state, new PathEvent("path", playerId, points));
    }

    // ── Called by SSE endpoint ──

    /// <summary>
    /// Subscribe to path updates for a seed. Returns current state + a channel reader for live updates.
    /// </summary>
    public (Dictionary<string, PathPoint[]> paths, ChannelReader<PathEvent> reader) Subscribe(string seed)
    {
        var state = _seeds.GetOrAdd(seed, _ => new SeedState());
        var channel = Channel.CreateBounded<PathEvent>(new BoundedChannelOptions(256)
        {
            FullMode = BoundedChannelFullMode.DropOldest
        });

        lock (state.SubLock)
        {
            state.Subscribers.Add(channel.Writer);
        }

        // Snapshot current paths
        var snapshot = new Dictionary<string, PathPoint[]>();
        foreach (var (id, player) in state.Players)
        {
            lock (player.PointsLock)
            {
                snapshot[id] = player.Points.ToArray();
            }
        }

        return (snapshot, channel.Reader);
    }

    public void Unsubscribe(string seed, ChannelReader<PathEvent> reader)
    {
        if (!_seeds.TryGetValue(seed, out var state)) return;

        lock (state.SubLock)
        {
            state.Subscribers.RemoveAll(w =>
            {
                // Find the writer whose reader matches
                if (w.TryComplete())
                    return true; // Mark completed writers for removal
                return false;
            });

            // Clean up completed writers
            state.Subscribers.RemoveAll(w => !w.TryWrite(default!));
        }
    }

    public void CompleteSubscription(string seed, ChannelWriter<PathEvent> writer)
    {
        writer.TryComplete();
        if (!_seeds.TryGetValue(seed, out var state)) return;

        lock (state.SubLock)
        {
            state.Subscribers.Remove(writer);
        }
    }

    // ── Internal ──

    private static void Broadcast(SeedState state, PathEvent evt)
    {
        lock (state.SubLock)
        {
            for (int i = state.Subscribers.Count - 1; i >= 0; i--)
            {
                if (!state.Subscribers[i].TryWrite(evt))
                {
                    // Channel full or completed — remove dead subscriber
                    state.Subscribers[i].TryComplete();
                    state.Subscribers.RemoveAt(i);
                }
            }
        }
    }

    // ── Backfill from DB (called on SSE connect if PathStore is empty for this seed) ──

    public void BackfillPaths(string seed, string playerId, PathPoint[] points)
    {
        var state = _seeds.GetOrAdd(seed, _ => new SeedState());
        var player = state.Players.GetOrAdd(playerId, _ => new PlayerPath());

        lock (player.PointsLock)
        {
            if (player.Points.Count == 0)
            {
                player.Points.AddRange(points);
            }
        }
    }

    public bool HasData(string seed)
    {
        return _seeds.TryGetValue(seed, out var state) && !state.Players.IsEmpty;
    }
}
