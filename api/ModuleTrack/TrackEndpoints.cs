using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ValHelpApi.Config;
using ValHelpApi.ModuleEvents;
using ValHelpApi.ModuleTrack.Rendering;

namespace ValHelpApi.ModuleTrack;

public static class TrackEndpoints
{
    internal static void Map(WebApplication app)
    {
        app.MapPost("api/trackhunt", PostTrackHunt);
        app.MapPost("api/track/hunt", PostTrackHunt2);
        app.MapPost("api/track/log", PostTrackLog);
        app.MapPost("api/track/logs", PostTrackLogs);
        app.MapGet("api/track/standings", GetTrackStandings);
        app.MapPost("api/track/map", PostTrackMap);
        app.MapGet("api/track/map/{seed}/paths", GetTrackMapPaths);
        app.MapGet("api/track/map/{seed}/paths/all", GetTrackMapPathsAll);
        app.MapGet("api/track/map/{seed}/bvec-benchmark", BvecBenchmark);
        app.MapPost("api/track/map/{seed}/bvec-regen", BvecRegen);
        app.MapGet("api/track/map/{seed}/pois", GetTrackMapPois);
        app.MapGet("api/track/map/{seed}/{asset}", GetTrackMapAsset);
    }

    public record TrackHuntRequest(string Player_Id, string Player_Name, string Player_Location, string Session_Id, int Current_Score, int Deaths, int Logouts, string Trophies, string Gamemode, JsonNode Extra);
    public record TrackHuntResponse(DateTime At);

    public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>> PostTrackHunt(TrackHuntRequest req, Channel<TrackHunt> channel)
    {
        // TODO: Validate request

        var hunt = new TrackHunt();
        hunt.CreatedAt = DateTime.UtcNow;
        hunt.PlayerId = req.Player_Id;
        hunt.PlayerName = req.Player_Name;
        hunt.PlayerLocation = req.Player_Location;
        hunt.SessionId = req.Session_Id;
        hunt.CurrentScore = req.Current_Score;
        hunt.Deaths = req.Deaths;
        hunt.Logouts = req.Logouts;
        hunt.Trophies = req.Trophies;
        hunt.Gamemode = req.Gamemode;

        await channel.Writer.WriteAsync(hunt);
        return TypedResults.Ok(new TrackHuntResponse(hunt.CreatedAt));
    }

    public record TrackHunt2Req(string Id, string User, string Seed, string Mode, int Score, int Deaths, int Relogs, int Slashdies, string[] Trophies);

    public static async Task<Results<ValidationProblem, Ok<TrackHuntResponse>>> PostTrackHunt2(TrackHunt2Req req, Channel<TrackHunt> channel)
    {
        // TODO: Validate request and use ValidationProblem

        var hunt = new TrackHunt();
        hunt.CreatedAt = DateTime.UtcNow;
        hunt.PlayerId = req.Id;
        hunt.PlayerName = req.User;
        hunt.PlayerLocation = "";
        hunt.SessionId = req.Seed;
        hunt.CurrentScore = req.Score;
        hunt.Deaths = req.Deaths;
        hunt.Logouts = req.Relogs;
        //hunt.Slashdies = req.Slashdies;
        hunt.Trophies = string.Join(',', req.Trophies);
        hunt.Gamemode = req.Mode;

        await channel.Writer.WriteAsync(hunt);
        return TypedResults.Ok(new TrackHuntResponse(hunt.CreatedAt));
    }


    public record TrackLogReq(string Id, string Seed, int Score, string Code);
    public record TrackLogResp(DateTime At, string Id);

    public static async Task<Results<ValidationProblem, Ok<TrackLogResp>>> PostTrackLog(TrackLogReq req, Channel<TrackLog> channel)
    {
        return await PostTrackLogs(new TrackLogsReq(req.Id, "", req.Seed, "", req.Score, [new TrackerLog(req.Code, DateTime.UtcNow)]), channel);
    }

    public record TrackLogsReq(string Id, string User, string Seed, string Mode, int Score, TrackerLog[] Logs);

    public static async Task<Results<ValidationProblem, Ok<TrackLogResp>>> PostTrackLogs(TrackLogsReq req, Channel<TrackLog> channel)
    {
        // TODO: Validate request and use ValidationProblem

        var log = new TrackLog();
        log.At = DateTime.UtcNow;
        log.Id = req.Id;
        log.User = req.User;
        log.Seed = req.Seed;
        log.Mode = req.Mode;
        log.Score = req.Score;
        log.Logs = req.Logs.ToList();
        await channel.Writer.WriteAsync(log);

        return TypedResults.Ok(new TrackLogResp(log.At, log.Id));
    }


    public record TrackStandingsPlayer(string Id, string Name, string AvatarUrl, int Score);
    public record TrackStandingsResp(string Name, string Mode, DateTime StartAt, DateTime EndAt, EventStatus Status, TrackStandingsPlayer[] Players, bool MapLoaded);

    public static async Task<Results<Ok<TrackStandingsResp>, NotFound>> GetTrackStandings([FromQuery] string seed, [FromQuery] string mode, AppDbContext db)
    {
        var later = DateTime.UtcNow.AddHours(-2);

        var ev = await db.Events
          .Where(h => h.Status == EventStatus.Live || (h.Status == EventStatus.Over && later < h.EndAt))
          .Where(h => h.Seed == seed)
          .Where(h => h.Mode == mode)
          .Select(h => new { h.Name, h.Mode, h.StartAt, h.EndAt, h.Status, h.Seed,
            Players = h.Players.Where(x => x.Status >= 0).Select(hp => new TrackStandingsPlayer(hp.User.DiscordId, hp.Name, hp.AvatarUrl, hp.Score)).ToArray() })
          .FirstOrDefaultAsync();

        if (ev == null)
        {
            return TypedResults.NotFound();
        }

        var mapLoaded = await db.TrackMaps.AnyAsync(m => m.Seed == ev.Seed);
        return TypedResults.Ok(new TrackStandingsResp(ev.Name, ev.Mode, ev.StartAt, ev.EndAt, ev.Status, ev.Players, mapLoaded));
    }


    public static async Task<IResult> PostTrackMap(HttpRequest request, AppDbContext db)
    {
        var form = await request.ReadFormAsync();
        var seed = form["seed"].ToString();
        var id = form["id"].ToString();

        if (string.IsNullOrEmpty(seed))
            return Results.BadRequest("seed is required");

        // Dedup: if we already have map data for this seed, accept but ignore
        if (await db.TrackMaps.AnyAsync(m => m.Seed == seed))
            return Results.Ok(new { accepted = true, stored = false });

        var mapFile = form.Files.GetFile("mapTex");
        var heightFile = form.Files.GetFile("heightTex");
        var maskFile = form.Files.GetFile("forestTex");

        if (mapFile == null || heightFile == null || maskFile == null)
            return Results.BadRequest("mapTex, heightTex, and forestTex files are required");

        // TODO: process the data using a channel so we can return early and not keep the client waiting for BVEC generation, which can be slow on large maps. For now we do it synchronously for simplicity.

        using var mapMs = new MemoryStream();
        using var heightMs = new MemoryStream();
        using var maskMs = new MemoryStream();
        await mapFile.CopyToAsync(mapMs);
        await heightFile.CopyToAsync(heightMs);
        await maskFile.CopyToAsync(maskMs);

        var mapBytes = mapMs.ToArray();
        var heightBytes = heightMs.ToArray();
        var maskBytes = maskMs.ToArray();

        // Generate BVEC server-side: v4 hi-fi extraction + v3 delta+deflate compression
        var bvec = await Task.Run(() =>
        {
            var raw = Rendering.BiomeExtractor.ExtractBinaryFromMemory(
                mapBytes, heightBytes, maskBytes, Rendering.BiomeExtractor.ExtractionMode.V4HiFi);
            return Rendering.BvecCompressor.CompressV3(raw);
        });

        var trackMap = new TrackMap
        {
            Seed = seed,
            MapTex = mapBytes,
            HeightTex = heightBytes,
            MaskTex = maskBytes,
            Bvec = bvec,
            BvecAt = DateTime.UtcNow,
            UploadedAt = DateTime.UtcNow,
            UploadedBy = id
        };

        db.TrackMaps.Add(trackMap);
        await db.SaveChangesAsync();

        return Results.Ok(new { accepted = true, stored = true });
    }


    public static async Task<IResult> GetTrackMapAsset(string seed, string asset, AppDbContext db, HttpContext ctx,
        IMemoryCache memoryCache, IConfiguration config)
    {
        if (asset == "biomes")
            return await GetTrackMapBvec(seed, db, ctx, memoryCache, config);

        if (asset == "forest")
        {
            // Static forest tile texture — same for all seeds
            var forestPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "forest.png");
            if (!File.Exists(forestPath))
                return Results.NotFound();
            ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(forestPath, "image/png");
        }

        var map = await db.TrackMaps
            .Where(m => m.Seed == seed)
            .Select(m => asset == "map" ? m.MapTex :
                         asset == "height" ? m.HeightTex :
                         asset == "mask" ? m.MaskTex : null)
            .FirstOrDefaultAsync();

        if (map != null && map.Length > 0)
        {
            ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(map, "image/png");
        }

        // Fallback: redirect to seedgen service
        var seedGenFile = asset switch { "map" => "mapTexCache", "height" => "heightTexCache", "mask" => "forestMaskTexCache", _ => null };
        return await ProxyFromSeedGen(seed, seedGenFile, config, ctx);
    }

    private record BvecCacheEntry(byte[] Bvec, DateTime BvecAt);

    private static async Task<IResult> GetTrackMapBvec(string seed, AppDbContext db, HttpContext ctx,
        IMemoryCache memoryCache, IConfiguration config)
    {
        var cacheKey = $"bvec:{seed}";
        if (!memoryCache.TryGetValue(cacheKey, out BvecCacheEntry? cached))
        {
            var trackMap = await db.TrackMaps
                .Where(m => m.Seed == seed && m.Bvec != null && m.BvecAt != null)
                .Select(m => new { m.Bvec, m.BvecAt })
                .FirstOrDefaultAsync();

            if (trackMap == null)
                return await ProxyFromSeedGen(seed, "bvec", config, ctx);

            cached = new BvecCacheEntry(trackMap.Bvec!, trackMap.BvecAt!.Value);
            memoryCache.Set(cacheKey, cached, TimeSpan.FromHours(4));
        }

        var etag = $"\"{cached.BvecAt:yyyyMMddHHmmss}\"";
        if (ctx.Request.Headers.IfNoneMatch == etag)
            return Results.StatusCode(304);

        ctx.Response.Headers.ETag = etag;
        ctx.Response.Headers.CacheControl = "public, max-age=86400";
        return Results.File(cached.Bvec, "application/octet-stream");
    }

    /// <summary>Get POIs (bosses, traders, start) for a seed via seedgen proxy.</summary>
    private static async Task<IResult> GetTrackMapPois(string seed, IConfiguration config, HttpContext ctx)
    {
        return await ProxyFromSeedGen(seed, "pois", config, ctx);
    }

    private static async Task<IResult> ProxyFromSeedGen(string seed, string? file, IConfiguration config, HttpContext ctx)
    {
        var seedGenUrl = config["SeedGenUrl"];
        if (string.IsNullOrEmpty(seedGenUrl) || string.IsNullOrEmpty(file))
            return Results.NotFound();

        int seedHash = Vh.Numerics.StableHash.GetStableHashCode(seed);
        var url = $"{seedGenUrl}/api/v2/seed{seedHash}/{file}";

        var httpFactory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>();
        var client = httpFactory.CreateClient();

        // Forward client's If-None-Match to seedgen
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        var clientEtag = ctx.Request.Headers.IfNoneMatch.ToString();
        if (!string.IsNullOrEmpty(clientEtag))
            request.Headers.TryAddWithoutValidation("If-None-Match", clientEtag);

        var resp = await client.SendAsync(request, ctx.RequestAborted);

        // Seedgen returned 304 — pass it through
        if (resp.StatusCode == System.Net.HttpStatusCode.NotModified)
        {
            ctx.Response.StatusCode = 304;
            return Results.Empty;
        }

        if (!resp.IsSuccessStatusCode)
            return Results.NotFound();

        // Forward cache headers from seedgen
        if (resp.Headers.ETag is { } etag)
            ctx.Response.Headers.ETag = etag.ToString();
        if (resp.Headers.CacheControl is { } cc)
            ctx.Response.Headers.CacheControl = cc.ToString();

        var contentType = resp.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        var bytes = await resp.Content.ReadAsByteArrayAsync(ctx.RequestAborted);
        return Results.File(bytes, contentType);
    }

    /// <summary>POC: Compression benchmark — compares extraction × format combinations.</summary>
    private static async Task<IResult> BvecBenchmark(string seed, AppDbContext db)
    {
        var trackMap = await db.TrackMaps
            .Where(m => m.Seed == seed)
            .Select(m => new { m.MapTex, m.HeightTex, m.MaskTex })
            .FirstOrDefaultAsync();

        if (trackMap == null || trackMap.MapTex.Length == 0)
            return Results.NotFound("No map data for this seed");

        // Re-extract with all four algorithms
        var texArgs = (trackMap.MapTex, trackMap.HeightTex, trackMap.MaskTex);
        var v1 = Rendering.BiomeExtractor.ExtractBinaryFromMemory(texArgs.MapTex, texArgs.HeightTex, texArgs.MaskTex,
            Rendering.BiomeExtractor.ExtractionMode.V1Legacy);
        var v2 = Rendering.BiomeExtractor.ExtractBinaryFromMemory(texArgs.MapTex, texArgs.HeightTex, texArgs.MaskTex,
            Rendering.BiomeExtractor.ExtractionMode.V2Targeted);
        var v3 = Rendering.BiomeExtractor.ExtractBinaryFromMemory(texArgs.MapTex, texArgs.HeightTex, texArgs.MaskTex,
            Rendering.BiomeExtractor.ExtractionMode.V3Uniform);
        var v4 = Rendering.BiomeExtractor.ExtractBinaryFromMemory(texArgs.MapTex, texArgs.HeightTex, texArgs.MaskTex,
            Rendering.BiomeExtractor.ExtractionMode.V4HiFi);

        var report = BvecCompressor.Benchmark(v1, v2, v3, v4);
        return Results.Text(report, "text/plain");
    }

    /// <summary>Regenerate BVEC for a seed using v4 extraction + v3 compression.</summary>
    private static async Task<IResult> BvecRegen(string seed, AppDbContext db, IMemoryCache memoryCache)
    {
        var trackMap = await db.TrackMaps.FirstOrDefaultAsync(m => m.Seed == seed);
        if (trackMap == null || trackMap.MapTex.Length == 0)
            return Results.NotFound("No map data for this seed");

        var oldSize = trackMap.Bvec?.Length ?? 0;

        var bvec = await Task.Run(() =>
        {
            var raw = Rendering.BiomeExtractor.ExtractBinaryFromMemory(
                trackMap.MapTex, trackMap.HeightTex, trackMap.MaskTex,
                Rendering.BiomeExtractor.ExtractionMode.V4HiFi);
            return Rendering.BvecCompressor.CompressV3(raw);
        });

        trackMap.Bvec = bvec;
        trackMap.BvecAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Invalidate cache
        memoryCache.Remove($"bvec:{seed}");

        return Results.Ok(new
        {
            seed,
            oldSize,
            newSize = bvec.Length,
            reduction = oldSize > 0 ? $"{100.0 * (oldSize - bvec.Length) / oldSize:F1}%" : "N/A",
        });
    }

    /// <summary>SSE endpoint streaming player path updates for live map.</summary>
    public static async Task GetTrackMapPaths(string seed, HttpContext ctx, PathStore pathStore, AppDbContext db)
    {
        ctx.Response.ContentType = "text/event-stream";
        ctx.Response.Headers.CacheControl = "no-cache";
        ctx.Response.Headers.Connection = "keep-alive";

        var ct = ctx.RequestAborted;

        // Backfill from DB if PathStore has no data for this seed
        if (!pathStore.HasData(seed))
        {
            var logs = await db.TrackLogs
                .Where(l => l.Seed == seed)
                .OrderBy(l => l.At)
                .ToListAsync(ct);

            foreach (var log in logs)
            {
                foreach (var entry in log.Logs)
                {
                    PathStore.PathPoint[] points;
                    if (CompactEventParser.IsCompactFormat(entry.Code))
                    {
                        points = CompactEventParser.Parse(entry.Code)
                            .Select(e => new PathStore.PathPoint(e.Secs, e.X, e.Z, e.Tag == 'J'))
                            .ToArray();
                    }
                    else if (entry.Code.StartsWith("Path="))
                    {
                        points = ParsePathPoints(entry.Code);
                    }
                    else continue;

                    if (points.Length > 0)
                        pathStore.BackfillPaths(seed, log.Id, points);
                }
            }
        }

        // Subscribe and get current snapshot
        var (paths, reader) = pathStore.Subscribe(seed);

        try
        {
            // Send initial state
            var initData = JsonSerializer.Serialize(paths, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            await ctx.Response.WriteAsync($"event: init\ndata: {initData}\n\n", ct);
            await ctx.Response.Body.FlushAsync(ct);

            // Stream updates
            await foreach (var evt in reader.ReadAllAsync(ct))
            {
                if (evt == null) continue;
                var json = JsonSerializer.Serialize(new { evt.Type, evt.PlayerId, evt.Data },
                    new JsonSerializerOptions(JsonSerializerDefaults.Web));
                await ctx.Response.WriteAsync($"event: update\ndata: {json}\n\n", ct);
                await ctx.Response.Body.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) { /* client disconnected */ }
    }

    /// <summary>GET endpoint returning all cached paths for replay/scrubbing.</summary>
    public static async Task<IResult> GetTrackMapPathsAll(string seed, AppDbContext db)
    {
        // Check for cached paths first
        var cached = await db.TrackMaps
            .Where(m => m.Seed == seed)
            .Select(m => m.Paths)
            .FirstOrDefaultAsync();

        if (cached != null)
            return Results.Content(cached, "application/json");

        // Build from track_logs and cache
        var pathsJson = await BuildAndCachePaths(seed, db);
        if (pathsJson == null)
            return Results.NotFound();

        return Results.Content(pathsJson, "application/json");
    }

    private static async Task<string?> BuildAndCachePaths(string seed, AppDbContext db)
    {
        var logs = await db.TrackLogs
            .Where(l => l.Seed == seed)
            .OrderBy(l => l.At)
            .ToListAsync();

        if (logs.Count == 0) return null;

        var paths = new Dictionary<string, List<PathStore.PathPoint>>();
        foreach (var log in logs)
        {
            foreach (var entry in log.Logs)
            {
                PathStore.PathPoint[] points;
                if (CompactEventParser.IsCompactFormat(entry.Code))
                {
                    points = CompactEventParser.Parse(entry.Code)
                        .Where(e => e.Tag == 'F' || e.Tag == 'W' || e.Tag == 'P' || e.Tag == 'J')
                        .Select(e => new PathStore.PathPoint(e.Secs, e.X, e.Z, e.Tag == 'J'))
                        .ToArray();
                }
                else if (entry.Code.StartsWith("Path="))
                {
                    points = ParsePathPoints(entry.Code);
                }
                else continue;

                if (points.Length == 0) continue;

                if (!paths.TryGetValue(log.Id, out var list))
                {
                    list = new List<PathStore.PathPoint>();
                    paths[log.Id] = list;
                }
                list.AddRange(points);
            }
        }

        if (paths.Count == 0) return null;

        // Deduplicate by time — replay logs can re-send entire history
        foreach (var (id, list) in paths)
        {
            var seen = new HashSet<int>();
            list.RemoveAll(p => !seen.Add(p.T));
        }

        var json = JsonSerializer.Serialize(paths, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        // Cache in track_maps
        await db.TrackMaps
            .Where(m => m.Seed == seed)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.Paths, json));

        return json;
    }

    private static PathStore.PathPoint[] ParsePathPoints(string code)
    {
        var points = new List<PathStore.PathPoint>();
        var data = code.AsSpan(5); // skip "Path="
        foreach (var seg in data.ToString().Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var ci = seg.IndexOf(':');
            if (ci < 0) continue;
            if (!int.TryParse(seg.AsSpan(0, ci), out var t)) continue;
            var coords = seg[(ci + 1)..].Split(',');
            if (coords.Length != 3) continue;
            if (int.TryParse(coords[0], out var x) && int.TryParse(coords[2], out var z))
                points.Add(new PathStore.PathPoint(t, x, z));
        }
        return points.ToArray();
    }

}
