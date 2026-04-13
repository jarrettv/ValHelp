using System.Collections.Concurrent;
using System.Threading.Channels;

namespace SeedGen;

public enum JobStatus { Queued, Processing, Done, Failed }

public sealed record Job
{
    public required int Id { get; init; }
    public required string Seed { get; init; }
    public int WorldGenVersion { get; init; } = 2;
    public JobStatus Status { get; set; } = JobStatus.Queued;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// In-memory job queue backed by a Channel for the worker and a ConcurrentDictionary for status lookups.
/// Completed artifacts live on the filesystem — this only tracks in-flight state.
/// </summary>
public sealed class JobQueue
{
    readonly Channel<Job> _channel = Channel.CreateUnbounded<Job>(
        new UnboundedChannelOptions { SingleReader = true });
    readonly ConcurrentDictionary<int, Job> _jobs = new();
    readonly ConcurrentDictionary<string, int> _seedIndex = new(); // seed → jobId (dedup)
    int _nextId;

    public ChannelReader<Job> Reader => _channel.Reader;

    /// <summary>
    /// Enqueue a seed. Returns existing job if one is already queued/processing for this seed.
    /// </summary>
    public Job Enqueue(string seed, int worldGenVersion)
    {
        // Dedup: return existing in-flight job for this seed
        if (_seedIndex.TryGetValue(seed, out var existingId) &&
            _jobs.TryGetValue(existingId, out var existing) &&
            existing.Status is JobStatus.Queued or JobStatus.Processing)
        {
            return existing;
        }

        var job = new Job
        {
            Id = Interlocked.Increment(ref _nextId),
            Seed = seed,
            WorldGenVersion = worldGenVersion,
        };

        _jobs[job.Id] = job;
        _seedIndex[seed] = job.Id;
        _channel.Writer.TryWrite(job);
        return job;
    }

    public Job? Get(int id) => _jobs.GetValueOrDefault(id);

    public int QueuePosition(int id)
    {
        int pos = 0;
        foreach (var job in _jobs.Values)
        {
            if (job.Status is JobStatus.Queued or JobStatus.Processing)
                pos++;
            if (job.Id == id) return pos;
        }
        return 0;
    }

    public void Remove(string seed)
    {
        if (_seedIndex.TryRemove(seed, out var id))
            _jobs.TryRemove(id, out _);
    }

    public IEnumerable<Job> GetActive()
        => _jobs.Values
            .Where(j => j.Status is JobStatus.Queued or JobStatus.Processing)
            .OrderBy(j => j.Id);

    public IReadOnlyCollection<Job> GetAllJobs() => _jobs.Values.ToList();
}
