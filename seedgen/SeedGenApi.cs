using Microsoft.Extensions.Options;

namespace SeedGen;

public static class SeedGenApi
{
    public static void MapEndpoints(this WebApplication app)
    {
        var seedgen = app.MapGroup("/api/seedgen");
        seedgen.MapPost("/submit", Submit);
        seedgen.MapPost("/regen", Regen);
        seedgen.MapGet("/status/{id:int}", GetStatus);
        seedgen.MapGet("/queue", GetQueue);
        seedgen.MapGet("/report", GetReport);

        app.MapGet("/api/v{worldGen:int}/seed{seedHash:int}/{file}", GetArtifact);
        app.MapGet("/health", GetHealth);
        app.MapGet("/", GetDashboard);
    }

    static IResult Submit(SubmitRequest req, JobQueue queue, IOptions<SeedGenOptions> options)
    {
        if (string.IsNullOrWhiteSpace(req.Seed))
            return Results.BadRequest("seed is required");

        var opts = options.Value;
        var seed = req.Seed.Trim();
        int seedHash = ValheimSeedHash.GetStableHashCode(seed);
        int worldGen = req.WorldGenVersion ?? 2;

        // Check filesystem cache first
        var poisPath = Path.Combine(opts.SeedDir(worldGen, seedHash), "pois");
        if (File.Exists(poisPath))
        {
            var cached = File.ReadAllText(poisPath);
            return Results.Ok(new StatusResponse(0, seed, "done", null, 0, cached, null));
        }

        var job = queue.Enqueue(seed, worldGen);
        var pos = queue.QueuePosition(job.Id);
        return Results.Ok(new StatusResponse(job.Id, seed, StatusName(job.Status),
            job.Status is JobStatus.Queued ? EstimateWait(pos) : null, pos, null, null));
    }

    static IResult Regen(RegenRequest req, JobQueue queue, ArtifactGenerator artifacts,
        IOptions<SeedGenOptions> options)
    {
        if (string.IsNullOrWhiteSpace(req.Seed))
            return Results.BadRequest("seed is required");

        var opts = options.Value;
        var seed = req.Seed.Trim();
        int seedHash = ValheimSeedHash.GetStableHashCode(seed);
        int worldGen = req.WorldGenVersion ?? 2;
        var dir = opts.SeedDir(worldGen, seedHash);

        if (req.Force)
        {
            // Full regen: delete everything, re-queue (boots Valheim server)
            if (Directory.Exists(dir))
                Directory.Delete(dir, recursive: true);

            queue.Remove(seed);
            var job = queue.Enqueue(seed, worldGen);
            var pos = queue.QueuePosition(job.Id);
            return Results.Ok(new StatusResponse(job.Id, seed, "queued", EstimateWait(pos), pos, null, null));
        }

        // Light regen: re-derive BVEC + POIs from existing db/textures on disk
        if (!Directory.Exists(dir))
            return Results.NotFound("No artifacts exist for this seed — use force=true for full generation");

        var dbPath = Path.Combine(dir, "db");
        if (!File.Exists(dbPath))
            return Results.NotFound("No .db file — use force=true for full generation");

        // Re-parse POIs from .db
        var pois = WorldDbParser.Parse(dbPath);
        var poisCount = pois?.Count ?? 0;
        var poisPath = Path.Combine(dir, "pois");
        if (pois != null && pois.Count > 0)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(pois, Json.CamelCase);
            File.WriteAllText(poisPath, json);
        }

        // Re-generate BVEC from textures
        artifacts.GenerateAll(seed, seedHash, worldGen, dir);

        return Results.Ok(new { seed, status = "done", poisCount, message = "BVEC + POIs regenerated" });
    }

    static IResult GetStatus(int id, JobQueue queue, IOptions<SeedGenOptions> options)
    {
        var job = queue.Get(id);
        if (job is null)
            return Results.NotFound();

        // If done, serve result from filesystem
        string? result = null;
        if (job.Status == JobStatus.Done)
        {
            int seedHash = ValheimSeedHash.GetStableHashCode(job.Seed);
            var poisPath = Path.Combine(options.Value.SeedDir(job.WorldGenVersion, seedHash), "pois");
            if (File.Exists(poisPath))
                result = File.ReadAllText(poisPath);
        }

        var pos = job.Status is JobStatus.Queued ? queue.QueuePosition(id) : 0;
        return Results.Ok(new StatusResponse(job.Id, job.Seed, StatusName(job.Status),
            job.Status is JobStatus.Queued ? EstimateWait(pos) : null, pos, result, job.Error));
    }

    static IResult GetQueue(JobQueue queue)
        => Results.Ok(queue.GetActive().Select(j => new
        {
            j.Id, j.Seed,
            status = StatusName(j.Status),
            j.CreatedAt, j.StartedAt,
        }));

    static IResult GetHealth(SeedGenWorker worker)
        => Results.Ok(new { status = "ok", worker = worker.IsRunning });

    static IResult GetArtifact(int worldGen, int seedHash, string file, HttpContext ctx,
        IOptions<SeedGenOptions> options)
    {
        if (!AllowedFiles.Contains(file))
            return Results.NotFound();

        var path = Path.Combine(options.Value.SeedDir(worldGen, seedHash), file);
        if (!File.Exists(path))
            return Results.NotFound();

        var lastWrite = File.GetLastWriteTimeUtc(path);
        var etag = $"\"{lastWrite.Ticks:x}\"";

        if (ctx.Request.Headers.IfNoneMatch == etag)
        {
            ctx.Response.StatusCode = 304;
            return Results.Empty;
        }

        ctx.Response.Headers.ETag = etag;
        ctx.Response.Headers.CacheControl = file == "pois"
            ? "public, max-age=3600"
            : "public, max-age=31536000, immutable";

        return Results.File(path, ContentTypes.GetValueOrDefault(file, "application/octet-stream"));
    }

    // ── Helpers ──

    static readonly HashSet<string> AllowedFiles =
        ["mapTexCache", "forestMaskTexCache", "heightTexCache", "bvec", "pois", "db"];

    static readonly Dictionary<string, string> ContentTypes = new()
    {
        ["pois"] = "application/json",
        ["bvec"] = "application/octet-stream",
        ["db"] = "application/octet-stream",
        ["mapTexCache"] = "image/png",
        ["forestMaskTexCache"] = "image/png",
        ["heightTexCache"] = "image/png",
    };

    static string StatusName(JobStatus s) => s switch
    {
        JobStatus.Queued => "queued",
        JobStatus.Processing => "processing",
        JobStatus.Done => "done",
        JobStatus.Failed => "failed",
        _ => "unknown",
    };

    static string? EstimateWait(int position)
    {
        if (position <= 0) return null;
        var seconds = position * 80;
        return seconds < 120 ? $"~{seconds}s" : $"~{seconds / 60}m";
    }

    // ── Report data ──

    record SeedReport(string Path, Dictionary<string, long> Files, long TotalBytes, string TotalSize, DateTime CreatedAt);
    record FileBreakdown(string File, long Total, string TotalSize, string AvgPerSeed, double Pct);
    record GrowthDay(string Date, int SeedsAdded, long BytesAdded, string SizeAdded, int CumSeeds, long CumBytes, string CumSize);

    record ReportData(
        int TotalSeeds, long TotalBytes, long AvgBytesPerSeed,
        int JobsQueued, int JobsProcessing, int JobsDone, int JobsFailed,
        List<FileBreakdown> FileBreakdowns, List<GrowthDay> Growth, List<SeedReport> Seeds);

    static ReportData BuildReport(JobQueue queue, SeedGenOptions opts)
    {
        var dataDir = opts.DataDir;
        var versionDirs = Directory.Exists(dataDir) ? Directory.GetDirectories(dataDir, "v*") : [];

        var seeds = new List<SeedReport>();
        long totalBytes = 0;
        var fileSizes = new Dictionary<string, long>();

        foreach (var vDir in versionDirs.OrderBy(d => d))
        {
            var vName = Path.GetFileName(vDir);
            foreach (var seedDir in Directory.GetDirectories(vDir, "seed*").OrderBy(d => d))
            {
                long seedBytes = 0;
                var files = new Dictionary<string, long>();
                foreach (var f in Directory.GetFiles(seedDir))
                {
                    var info = new FileInfo(f);
                    files[info.Name] = info.Length;
                    seedBytes += info.Length;
                    fileSizes[info.Name] = fileSizes.GetValueOrDefault(info.Name) + info.Length;
                }
                totalBytes += seedBytes;
                seeds.Add(new($"{vName}/{Path.GetFileName(seedDir)}", files, seedBytes,
                    FormatSize(seedBytes), File.GetCreationTimeUtc(seedDir)));
            }
        }

        var allJobs = queue.GetAllJobs();
        var avgPerSeed = seeds.Count > 0 ? totalBytes / seeds.Count : 0;

        var breakdowns = fileSizes.OrderByDescending(kv => kv.Value)
            .Select(kv => new FileBreakdown(kv.Key, kv.Value, FormatSize(kv.Value),
                FormatSize(seeds.Count > 0 ? kv.Value / seeds.Count : 0),
                totalBytes > 0 ? 100.0 * kv.Value / totalBytes : 0))
            .ToList();

        long cum = 0;
        var growth = seeds.GroupBy(s => s.CreatedAt.Date).OrderBy(g => g.Key)
            .Select(g =>
            {
                cum += g.Sum(s => s.TotalBytes);
                return new GrowthDay(g.Key.ToString("yyyy-MM-dd"), g.Count(), g.Sum(s => s.TotalBytes),
                    FormatSize(g.Sum(s => s.TotalBytes)),
                    seeds.Count(s => s.CreatedAt.Date <= g.Key), cum, FormatSize(cum));
            }).ToList();

        return new(seeds.Count, totalBytes, avgPerSeed,
            allJobs.Count(j => j.Status == JobStatus.Queued),
            allJobs.Count(j => j.Status == JobStatus.Processing),
            allJobs.Count(j => j.Status == JobStatus.Done),
            allJobs.Count(j => j.Status == JobStatus.Failed),
            breakdowns, growth, seeds);
    }

    static IResult GetReport(JobQueue queue, IOptions<SeedGenOptions> options)
    {
        var r = BuildReport(queue, options.Value);
        return Results.Ok(new
        {
            summary = new { r.TotalSeeds, totalSize = FormatSize(r.TotalBytes), r.TotalBytes,
                avgPerSeed = FormatSize(r.AvgBytesPerSeed), avgBytesPerSeed = r.AvgBytesPerSeed },
            jobs = new { queued = r.JobsQueued, processing = r.JobsProcessing, done = r.JobsDone, failed = r.JobsFailed,
                total = r.JobsQueued + r.JobsProcessing + r.JobsDone + r.JobsFailed },
            storageByFile = r.FileBreakdowns.Select(f => new { f.File, f.TotalSize, f.AvgPerSeed, pctOfTotal = $"{f.Pct:F1}%" }),
            growth = r.Growth.Select(g => new { g.Date, g.SeedsAdded, g.SizeAdded, g.CumSeeds, cumulativeSize = g.CumSize }),
            seeds = r.Seeds.Select(s => new { s.Path, s.TotalSize, s.CreatedAt }),
        });
    }

    static IResult GetDashboard(JobQueue queue, IOptions<SeedGenOptions> options)
    {
        var r = BuildReport(queue, options.Value);
        var html = RenderDashboard(r);
        return Results.Content(html, "text/html");
    }

    static string RenderDashboard(ReportData r)
    {
        // Storage breakdown pie chart
        var colors = new[] { "#4f8cff", "#ff6b6b", "#51cf66", "#ffd43b", "#cc5de8", "#20c997" };
        var pieSlices = new System.Text.StringBuilder();
        double offset = 0;
        for (int i = 0; i < r.FileBreakdowns.Count; i++)
        {
            var f = r.FileBreakdowns[i];
            var color = colors[i % colors.Length];
            var size = f.Pct;
            // SVG donut segment via stroke-dasharray
            var circumference = 2 * Math.PI * 60;
            var dash = circumference * size / 100;
            var gap = circumference - dash;
            var rotation = offset * 360 / 100 - 90;
            pieSlices.Append($"""<circle r="60" cx="80" cy="80" fill="none" stroke="{color}" stroke-width="30" stroke-dasharray="{dash:F1} {gap:F1}" transform="rotate({rotation:F1} 80 80)"/>""");
            offset += size;
        }

        var pieLegend = new System.Text.StringBuilder();
        for (int i = 0; i < r.FileBreakdowns.Count; i++)
        {
            var f = r.FileBreakdowns[i];
            var color = colors[i % colors.Length];
            pieLegend.Append($"""<div style="display:flex;align-items:center;gap:6px;margin:4px 0"><span style="width:12px;height:12px;background:{color};border-radius:2px;display:inline-block"></span><span>{f.File}</span><span style="color:#888">({f.Pct:F1}% &mdash; {f.AvgPerSeed}/seed)</span></div>""");
        }

        // Growth bar chart
        var growthBars = new System.Text.StringBuilder();
        if (r.Growth.Count > 0)
        {
            int maxSeeds = r.Growth.Max(g => g.CumSeeds);
            long maxBytes = r.Growth.Max(g => g.CumBytes);
            int barWidth = Math.Max(30, 400 / Math.Max(r.Growth.Count, 1));

            for (int i = 0; i < r.Growth.Count; i++)
            {
                var g = r.Growth[i];
                var barH = maxSeeds > 0 ? (int)(120.0 * g.CumSeeds / maxSeeds) : 0;
                var x = i * (barWidth + 4) + 40;
                growthBars.Append($"""<rect x="{x}" y="{140 - barH}" width="{barWidth - 2}" height="{barH}" fill="#4f8cff" rx="3"/>""");
                growthBars.Append($"""<text x="{x + barWidth / 2}" y="{155}" text-anchor="middle" fill="#888" font-size="10">{g.Date[5..]}</text>""");
                growthBars.Append($"""<text x="{x + barWidth / 2}" y="{135 - barH}" text-anchor="middle" fill="#ccc" font-size="11">{g.CumSeeds}</text>""");
            }

            // Y-axis labels
            growthBars.Append($"""<text x="35" y="15" text-anchor="end" fill="#888" font-size="10">{maxSeeds}</text>""");
            growthBars.Append($"""<text x="35" y="140" text-anchor="end" fill="#888" font-size="10">0</text>""");
            growthBars.Append($"""<line x1="38" y1="0" x2="38" y2="140" stroke="#333"/>""");
            growthBars.Append($"""<line x1="38" y1="140" x2="{r.Growth.Count * (barWidth + 4) + 50}" y2="140" stroke="#333"/>""");
        }

        int svgWidth = Math.Max(300, r.Growth.Count * 34 + 80);

        var seedRows = new System.Text.StringBuilder();
        foreach (var s in r.Seeds.OrderByDescending(s => s.CreatedAt))
        {
            seedRows.Append($"<tr><td>{s.Path}</td><td>{s.TotalSize}</td><td>{s.CreatedAt:yyyy-MM-dd HH:mm}</td></tr>");
        }

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Seedgen Dashboard</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #e6edf3; padding: 24px; max-width: 900px; margin: 0 auto; }
          h1 { font-size: 22px; margin-bottom: 20px; color: #58a6ff; }
          h2 { font-size: 16px; margin: 24px 0 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; }
          .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
          .card .value { font-size: 28px; font-weight: 700; color: #f0f6fc; }
          .card .label { font-size: 12px; color: #8b949e; margin-top: 4px; }
          .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          @media (max-width: 600px) { .charts { grid-template-columns: 1fr; } }
          .chart-box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
          .chart-box h3 { font-size: 13px; color: #8b949e; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { text-align: left; color: #8b949e; font-size: 12px; padding: 8px 12px; border-bottom: 1px solid #30363d; }
          td { padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #21262d; font-family: 'SF Mono', monospace; }
          tr:hover td { background: #161b22; }
          .queue-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
          .q { background: #1f2937; color: #60a5fa; }
          .p { background: #1c2333; color: #f59e0b; }
          .d { background: #132a1c; color: #34d399; }
          .f { background: #2a1318; color: #f87171; }
          footer { margin-top: 32px; text-align: center; color: #484f58; font-size: 11px; }
        </style>
        </head>
        <body>
        <h1>Seedgen Dashboard</h1>

        <div class="cards">
          <div class="card"><div class="value">{{r.TotalSeeds}}</div><div class="label">Total Seeds</div></div>
          <div class="card"><div class="value">{{FormatSize(r.TotalBytes)}}</div><div class="label">Total Storage</div></div>
          <div class="card"><div class="value">{{FormatSize(r.AvgBytesPerSeed)}}</div><div class="label">Avg / Seed</div></div>
          <div class="card">
            <div class="value" style="font-size:16px;line-height:1.6">
              <span class="queue-badge q">{{r.JobsQueued}} queued</span>
              <span class="queue-badge p">{{r.JobsProcessing}} active</span>
              <span class="queue-badge d">{{r.JobsDone}} done</span>
              {{(r.JobsFailed > 0 ? $"""<span class="queue-badge f">{r.JobsFailed} failed</span>""" : "")}}
            </div>
            <div class="label">Jobs (this session)</div>
          </div>
        </div>

        <div class="charts">
          <div class="chart-box">
            <h3>Storage Breakdown</h3>
            <div style="display:flex;align-items:center;gap:20px">
              <svg width="160" height="160" viewBox="0 0 160 160">{{pieSlices}}</svg>
              <div style="font-size:12px">{{pieLegend}}</div>
            </div>
          </div>
          <div class="chart-box">
            <h3>Cumulative Seeds</h3>
            <svg width="{{svgWidth}}" height="170" viewBox="0 0 {{svgWidth}} 170">{{growthBars}}</svg>
          </div>
        </div>

        <h2>Seeds</h2>
        <table>
          <tr><th>Path</th><th>Size</th><th>Created</th></tr>
          {{seedRows}}
        </table>

        <footer>seedgen &middot; {{DateTime.UtcNow:yyyy-MM-dd HH:mm}} UTC &middot; <a href="/api/seedgen/report" style="color:#484f58">JSON</a></footer>
        </body>
        </html>
        """;
    }

    static string FormatSize(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:F1} KB",
        < 1024L * 1024 * 1024 => $"{bytes / (1024.0 * 1024):F1} MB",
        _ => $"{bytes / (1024.0 * 1024 * 1024):F2} GB",
    };
}

public record SubmitRequest(string Seed, int? WorldGenVersion = null);
public record RegenRequest(string Seed, int? WorldGenVersion = null, bool Force = false);
public record StatusResponse(int Id, string Seed, string Status, string? EstWait,
    int QueuePosition, string? Result, string? Error);
