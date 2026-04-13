using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SeedGen;

/// <summary>
/// Background service that reads from the in-memory job queue,
/// boots a headless Valheim server to extract POIs, then generates textures + BVEC.
/// </summary>
public sealed class SeedGenWorker(
    JobQueue queue,
    ArtifactGenerator artifacts,
    IOptions<SeedGenOptions> options,
    ILogger<SeedGenWorker> logger) : BackgroundService
{
    readonly SeedGenOptions _opts = options.Value;

    public bool IsRunning { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(_opts.WorldsDir);
        IsRunning = true;
        logger.LogInformation("Worker started");

        await foreach (var job in queue.Reader.ReadAllAsync(ct))
        {
            try
            {
                job.Status = JobStatus.Processing;
                job.StartedAt = DateTime.UtcNow;
                logger.LogInformation("Processing job #{Id}: seed={Seed} worldGen={WorldGen}",
                    job.Id, job.Seed, job.WorldGenVersion);

                await ProcessJob(job, ct);

                job.Status = JobStatus.Done;
                job.CompletedAt = DateTime.UtcNow;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Job #{Id} failed", job.Id);
                job.Status = JobStatus.Failed;
                job.Error = ex.Message;
                job.CompletedAt = DateTime.UtcNow;
            }
        }
    }

    async Task ProcessJob(Job job, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var worldName = $"sg_{job.Id}";
        var fwlPath = Path.Combine(_opts.WorldsDir, $"{worldName}.fwl");
        var dbPath = Path.Combine(_opts.WorldsDir, $"{worldName}.db");
        var logPath = $"/tmp/server_{job.Id}.log";

        try
        {
            FwlWriter.Write(fwlPath, job.Seed, worldName, job.WorldGenVersion);

            await RunValheimServer(job.Id, worldName, logPath, ct);

            if (!File.Exists(dbPath))
                throw new InvalidOperationException($"No .db file at {dbPath}");

            var pois = WorldDbParser.Parse(dbPath)
                ?? throw new InvalidOperationException("No POIs found in .db");

            int seedHash = ValheimSeedHash.GetStableHashCode(job.Seed);
            var outDir = _opts.SeedDir(job.WorldGenVersion, seedHash);

            Directory.CreateDirectory(outDir);
            File.Copy(dbPath, Path.Combine(outDir, "db"), overwrite: true);
            await File.WriteAllTextAsync(Path.Combine(outDir, "pois"),
                JsonSerializer.Serialize(pois, Json.CamelCase), ct);

            logger.LogInformation("Job #{Id}: generating textures + BVEC", job.Id);
            artifacts.GenerateAll(job.Seed, seedHash, job.WorldGenVersion, outDir);

            logger.LogInformation("Job #{Id} done: {Count} POIs at {Dir}, {Secs:F1}s",
                job.Id, pois.Count, outDir, sw.Elapsed.TotalSeconds);
        }
        finally
        {
            CleanupWorldFiles(worldName, logPath);
        }
    }

    async Task RunValheimServer(int jobId, string worldName, string logPath, CancellationToken ct)
    {
        var serverExe = Path.Combine(_opts.ServerDir, "valheim_server.x86_64");

        var psi = new ProcessStartInfo
        {
            FileName = serverExe,
            Arguments = $"-nographics -batchmode -world {worldName} -name {worldName} -port 2456 -password seedgen_tmp",
            WorkingDirectory = _opts.ServerDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["SteamAppId"] = "892970";
        psi.Environment["LD_LIBRARY_PATH"] =
            $"{_opts.ServerDir}/linux64:{Environment.GetEnvironmentVariable("LD_LIBRARY_PATH") ?? ""}";

        using var logWriter = new StreamWriter(logPath, false);
        using var proc = Process.Start(psi)!;

        var readOut = PipeToLog(proc.StandardOutput, logWriter);
        var readErr = PipeToLog(proc.StandardError, logWriter);

        // Wait for location generation
        var deadline = DateTime.UtcNow.AddSeconds(_opts.ServerTimeoutSec);
        bool generated = false;

        while (DateTime.UtcNow < deadline && !proc.HasExited)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(2000, ct);
            if (File.Exists(logPath) &&
                (await File.ReadAllTextAsync(logPath, ct)).Contains("Done generating locations"))
            {
                generated = true;
                logger.LogInformation("Job #{Id}: locations generated, shutting down", jobId);
                break;
            }
        }

        if (!generated && !proc.HasExited)
        {
            proc.Kill(true);
            await proc.WaitForExitAsync(ct);
            await Task.WhenAll(readOut, readErr);
            throw new TimeoutException("Server timed out before generating locations");
        }

        // Graceful shutdown — SIGTERM so server saves .db
        if (!proc.HasExited)
        {
            Process.Start("kill", $"-TERM {proc.Id}")?.WaitForExit();

            var saveDeadline = DateTime.UtcNow.AddSeconds(30);
            while (DateTime.UtcNow < saveDeadline && !proc.HasExited)
            {
                await Task.Delay(1000, ct);
                if (File.Exists(logPath) &&
                    (await File.ReadAllTextAsync(logPath, ct)).Contains("World saved"))
                {
                    logger.LogInformation("Job #{Id}: world saved", jobId);
                    break;
                }
            }

            if (!proc.HasExited) proc.Kill(true);
            await proc.WaitForExitAsync(ct);
        }

        await Task.WhenAll(readOut, readErr);
    }

    static async Task PipeToLog(StreamReader source, StreamWriter log)
    {
        while (await source.ReadLineAsync() is { } line)
        {
            await log.WriteLineAsync(line);
            await log.FlushAsync();
        }
    }

    void CleanupWorldFiles(string worldName, string logPath)
    {
        try { foreach (var f in Directory.GetFiles(_opts.WorldsDir, $"{worldName}*")) File.Delete(f); } catch { }
        try { File.Delete(logPath); } catch { }
    }
}
