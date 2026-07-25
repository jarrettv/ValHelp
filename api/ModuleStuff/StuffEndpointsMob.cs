using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.Sqlite;

namespace ValHelpApi.ModuleStuff;

/// <summary>
/// Serves creature "portrait" renders from renders.db (per-star WebP blobs
/// produced by scripts/ingest_captures.py). Kept in a standalone SQLite file so
/// it's independent of items.db (which the extractor rebuilds from scratch).
///
///   GET api/mob/&lt;code&gt;_&lt;star&gt;.webp   e.g. /api/mob/TrophyCharredMelee_2.webp
/// </summary>
public static class StuffEndpointsMob
{
    static string? _dbPath;

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/mob/{name}.webp", GetMobRender);
    }

    // name = "<code>_<star>". Codes may contain underscores (e.g. Bestiary_Bat),
    // so split on the LAST underscore.
    static async Task<Results<FileContentHttpResult, NotFound>> GetMobRender(
        HttpContext ctx, IWebHostEnvironment env, ILoggerFactory lf, string name)
    {
        var log = lf.CreateLogger("MobRender");
        int i = name.LastIndexOf('_');
        if (i <= 0 || !int.TryParse(name[(i + 1)..], out int star))
            return TypedResults.NotFound();
        string code = name[..i];

        string? dbPath = ResolveDb(env, log);
        if (dbPath == null)
            return TypedResults.NotFound();

        await using var conn = new SqliteConnection($"Data Source={dbPath};Mode=ReadOnly");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT webp FROM renders WHERE code = $c AND star = $s";
        cmd.Parameters.AddWithValue("$c", code);
        cmd.Parameters.AddWithValue("$s", star);
        if (await cmd.ExecuteScalarAsync() is not byte[] blob)
            return TypedResults.NotFound();

        ctx.Response.Headers.CacheControl = "public, max-age=86400";
        return TypedResults.File(blob, "image/webp");
    }

    // renders.db lives with the web data. ContentRootPath varies by how the app is
    // launched (dotnet watch/run vs published), so try several bases × relative paths.
    static readonly string[] _rel =
    {
        "web/public/data/vh/renders.db",      // base = repo root
        "../web/public/data/vh/renders.db",   // base = api/ (dev)
        "wwwroot/data/vh/renders.db",         // base = published api (prod)
        "../wwwroot/data/vh/renders.db",
    };

    static string? ResolveDb(IWebHostEnvironment env, ILogger log)
    {
        if (_dbPath != null && File.Exists(_dbPath))
            return _dbPath;
        var bases = new[] { env.ContentRootPath, Directory.GetCurrentDirectory(), AppContext.BaseDirectory };
        foreach (var b in bases)
            foreach (var rel in _rel)
            {
                var p = Path.GetFullPath(Path.Combine(b, rel));
                if (File.Exists(p))
                {
                    _dbPath = p;
                    return p;
                }
            }
        log.LogWarning("mob renders.db NOT FOUND. ContentRoot={CR} CWD={CWD}",
            env.ContentRootPath, Directory.GetCurrentDirectory());
        return null;
    }
}
