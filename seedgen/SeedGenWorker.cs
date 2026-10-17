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
        var logPath = $"/tmp/server_{job.Id}.log";

        // The oracle plugin writes its loot (every job) and worldgen dumps (oracle
        // jobs) here; collected into the seed dir below.
        var oracleDir = Path.Combine(_opts.WorldsDir, $"{worldName}_oracle");

        try
        {
            FwlWriter.Write(fwlPath, job.Seed, worldName, job.WorldGenVersion);

            await RunValheimServer(job.Id, worldName, logPath, ct, job.Oracle, oracleDir);

            // We hand the server a legacy .fwl; 1.0 upgrades it and saves in the
            // chunked layout, worlds_local/<world>/_main.<n>.db2.
            var dbPath = FindWorldDb2(worldName)
                ?? throw new InvalidOperationException(
                    $"No _main.*.db2 under {Path.Combine(_opts.WorldsDir, worldName)} — did the world save?");

            int seedHash = ValheimSeedHash.GetStableHashCode(job.Seed);
            // One generator for both the POI biome lookup and the textures.
            var wg = new Vh.World.WorldGenerator(seedHash, job.WorldGenVersion);
            // Chest contents, beehives etc. as the game itself spawned them.
            var loot = Vh.World.LocationFinder.LoadLoot(Path.Combine(oracleDir, "oracle.loot.json"));
            if (loot == null)
                logger.LogWarning("Job #{Id}: no loot dump from the plugin — POIs will carry no loot", job.Id);
            var pois = Vh.World.LocationFinder.ReadFromWorldDb(dbPath, seedHash, out var unknown, wg, loot)
                ?? throw new InvalidOperationException("No POIs found in .db2");
            if (unknown.Count > 0)
                logger.LogWarning("Job #{Id}: {Count} location instance(s) of {Types} unrecognised prefab hash(es), emitted as type Unknown: {Hashes}",
                    job.Id, unknown.Values.Sum(), unknown.Count,
                    string.Join(", ", unknown.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Key}x{kv.Value}")));

            var outDir = _opts.SeedDir(job.WorldGenVersion, seedHash);

            Directory.CreateDirectory(outDir);
            File.Copy(dbPath, Path.Combine(outDir, "db"), overwrite: true);
            await File.WriteAllTextAsync(Path.Combine(outDir, "pois"),
                JsonSerializer.Serialize(pois, Json.CamelCase), ct);
            PoiCache.MarkCurrent(outDir);

            CollectOracle(job.Id, oracleDir, outDir);

            logger.LogInformation("Job #{Id}: generating textures + BVEC", job.Id);
            artifacts.GenerateAll(job.Seed, seedHash, job.WorldGenVersion, outDir, wg);

            logger.LogInformation("Job #{Id} done: {Count} POIs at {Dir}, {Secs:F1}s",
                job.Id, pois.Count, outDir, sw.Elapsed.TotalSeconds);
        }
        finally
        {
            CleanupWorldFiles(worldName, logPath);
        }
    }

    async Task RunValheimServer(int jobId, string worldName, string logPath, CancellationToken ct,
        bool oracle = false, string? oracleDir = null)
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

        var ldPath = $"{_opts.ServerDir}/linux64:{Environment.GetEnvironmentVariable("LD_LIBRARY_PATH") ?? ""}";

        // BepInEx loads the ValHelp plugin on every job: it records the loot the
        // game rolls for each location (VALHELP_LOOT), and on oracle jobs also
        // dumps worldgen ground truth (VALHELP_ORACLE).
        {
            // Doorstop, exactly as the BepInEx pack's start_server_bepinex.sh does
            // it. Paths are absolute rather than the script's relative ones since we
            // are not going through a shell with cwd already set.
            // The Valheim pack ships Doorstop 3, which reads DOORSTOP_ENABLE /
            // DOORSTOP_INVOKE_DLL_PATH; the v4 names leave it half-configured and
            // the server segfaults on start.
            psi.Environment["DOORSTOP_ENABLE"] = "TRUE";
            psi.Environment["DOORSTOP_INVOKE_DLL_PATH"] =
                Path.Combine(_opts.ServerDir, "BepInEx/core/BepInEx.Preloader.dll");
            psi.Environment["DOORSTOP_CORLIB_OVERRIDE_PATH"] =
                Path.Combine(_opts.ServerDir, "unstripped_corlib");
            psi.Environment["LD_PRELOAD"] =
                $"libdoorstop_x64.so:{Environment.GetEnvironmentVariable("LD_PRELOAD") ?? ""}";
            ldPath = $"{_opts.ServerDir}/doorstop_libs:{ldPath}";

            psi.Environment["VALHELP_LOOT"] = "1";
            if (oracle) psi.Environment["VALHELP_ORACLE"] = "1";
            if (oracleDir is not null)
            {
                Directory.CreateDirectory(oracleDir);
                psi.Environment["VALHELP_ORACLE_DIR"] = oracleDir;
            }
        }

        psi.Environment["LD_LIBRARY_PATH"] = ldPath;

        using var logWriter = new StreamWriter(logPath, false);
        using var proc = Process.Start(psi)!;

        var readOut = PipeToLog(proc.StandardOutput, logWriter);
        var readErr = PipeToLog(proc.StandardError, logWriter);

        // The plugin starts once ZoneSystem.LocationsGenerated is set and logs its
        // own sentinel when its dumps are written, so wait for that rather than the
        // location-generation log line.
        const string marker = "[valhelp-oracle] DONE";
        var timeoutSec = oracle ? _opts.ServerTimeoutSec + _opts.OracleTimeoutSec : _opts.ServerTimeoutSec;
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSec);
        bool generated = false;

        while (DateTime.UtcNow < deadline && !proc.HasExited)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(2000, ct);
            if (!File.Exists(logPath)) continue;

            var log = await File.ReadAllTextAsync(logPath, ct);

            if (!oracle && log.Contains("[valhelp-oracle] FAILED"))
            {
                // Loot is a nice-to-have: keep the POIs, save the world as usual.
                logger.LogWarning("Job #{Id}: loot plugin failed; continuing without loot", jobId);
                generated = true;
                break;
            }
            if (oracle && log.Contains("[valhelp-oracle] FAILED"))
            {
                proc.Kill(true);
                await proc.WaitForExitAsync(ct);
                await Task.WhenAll(readOut, readErr);
                throw new InvalidOperationException(
                    "Oracle plugin failed — see server log. If the plugin never logged at all, " +
                    "BepInEx did not load: check doorstop_libs/libdoorstop_x64.so and " +
                    "BepInEx/core/BepInEx.Preloader.dll exist under the server dir.");
            }

            if (log.Contains(marker))
            {
                generated = true;
                logger.LogInformation("Job #{Id}: {What}, shutting down",
                    jobId, oracle ? "oracle dump complete" : "locations generated, loot recorded");
                break;
            }
        }

        if (!generated && !proc.HasExited)
        {
            proc.Kill(true);
            await proc.WaitForExitAsync(ct);
            await Task.WhenAll(readOut, readErr);
            throw new TimeoutException(
                $"Server timed out after {timeoutSec}s waiting for \"{marker}\"");
        }

        if (!generated)
        {
            // Exited on its own before generating anything. The log is deleted
            // with the world files, so surface its tail now.
            await Task.WhenAll(readOut, readErr);
            lock (logWriter) logWriter.Flush();
            var tail = File.Exists(logPath)
                ? string.Join('\n', File.ReadLines(logPath).TakeLast(15))
                : "(no log)";
            throw new InvalidOperationException(
                $"Server exited (code {proc.ExitCode}) before \"{marker}\". Log tail:\n{tail}");
        }

        // The plugin saves the world before it samples locations; once it has,
        // there's nothing to wait for — and a shutdown save after the samples
        // would be skipped anyway — so just stop the server.
        if (!proc.HasExited &&
            (await File.ReadAllTextAsync(logPath, ct)).Contains("World save (5/5) done"))
        {
            proc.Kill(true);
            await proc.WaitForExitAsync(ct);
        }

        // Otherwise (plugin didn't run): graceful shutdown — SIGTERM so the server saves.
        if (!proc.HasExited)
        {
            Process.Start("kill", $"-TERM {proc.Id}")?.WaitForExit();

            // Generous: after the loot dump has spawned and destroyed hundreds of
            // locations (dungeons especially) the server can take a while to save.
            var saveDeadline = DateTime.UtcNow.AddSeconds(180);
            while (DateTime.UtcNow < saveDeadline && !proc.HasExited)
            {
                await Task.Delay(1000, ct);
                if (File.Exists(logPath) &&
                    (await File.ReadAllTextAsync(logPath, ct)).Contains("World save (5/5) done"))
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
        // stdout and stderr both pipe into the same writer from separate tasks;
        // StreamWriter allows one async operation at a time, so under heavy
        // output (e.g. a busy loot dump) unsynchronised writes throw. Write
        // synchronously under a lock instead.
        while (await source.ReadLineAsync() is { } line)
        {
            lock (log)
            {
                log.WriteLine(line);
                log.Flush();
            }
        }
    }

    /// <summary>
    /// Moves the oracle dump into the seed's artifact directory. Named
    /// <c>oracle.*</c> by the plugin and served under those names, so a comparison
    /// run can fetch them directly.
    /// </summary>
    void CollectOracle(int jobId, string oracleDir, string outDir)
    {
        if (!Directory.Exists(oracleDir))
        {
            logger.LogWarning("Job #{Id}: no plugin output at {Dir}", jobId, oracleDir);
            return;
        }

        int n = 0;
        foreach (var src in Directory.GetFiles(oracleDir, "oracle.*"))
        {
            File.Copy(src, Path.Combine(outDir, Path.GetFileName(src)), overwrite: true);
            n++;
        }
        logger.LogInformation("Job #{Id}: collected {Count} oracle file(s)", jobId, n);
    }

    /// <summary>Newest <c>_main.&lt;n&gt;.db2</c> in the world's chunked save dir.</summary>
    string? FindWorldDb2(string worldName)
    {
        var dir = Path.Combine(_opts.WorldsDir, worldName);
        if (!Directory.Exists(dir)) return null;
        return Directory.GetFiles(dir, "_main.*.db2")
            .Select(f => (f, n: uint.TryParse(Path.GetFileName(f).Split('.')[1], out var n) ? n : 0u))
            .OrderByDescending(x => x.n)
            .Select(x => x.f)
            .FirstOrDefault();
    }

    void CleanupWorldFiles(string worldName, string logPath)
    {
        // The legacy .fwl we wrote, the chunked save dir, the oracle dir, and any
        // backups the server made when upgrading the world — all prefixed by name.
        try { foreach (var f in Directory.GetFiles(_opts.WorldsDir, $"{worldName}*")) File.Delete(f); } catch { }
        try { foreach (var d in Directory.GetDirectories(_opts.WorldsDir, $"{worldName}*")) Directory.Delete(d, recursive: true); } catch { }
        try { File.Delete(logPath); } catch { }
    }
}
