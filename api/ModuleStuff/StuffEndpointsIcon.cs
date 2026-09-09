using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.Sqlite;

namespace ValHelpApi.ModuleStuff;

/// <summary>
/// Serves item icons from icons.db (PNG blobs produced by
/// ValHelpTools/Scripts/export_web_data.py). Kept in a standalone SQLite file
/// for the same reason renders.db is: the icons used to be ~1000 loose PNGs
/// under web/public/data/vh/icons/, and because Unity re-compresses its sprite
/// atlas on most game patches, re-extracting rewrote nearly every one of them
/// with a visually identical image. One binary file makes that a one-line diff.
///
///   GET api/icon/&lt;code&gt;.png   e.g. /api/icon/SwordBronze.png
/// </summary>
public static class StuffEndpointsIcon
{
    static string? _dbPath;

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/icon/{code}.png", GetItemIcon);
    }

    static async Task<Results<FileContentHttpResult, NotFound>> GetItemIcon(
        HttpContext ctx, IWebHostEnvironment env, ILoggerFactory lf, string code)
    {
        var log = lf.CreateLogger("ItemIcon");

        string? dbPath = ResolveDb(env, log);
        if (dbPath == null)
            return TypedResults.NotFound();

        await using var conn = new SqliteConnection($"Data Source={dbPath};Mode=ReadOnly");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT png FROM icons WHERE code = $c";
        cmd.Parameters.AddWithValue("$c", code);
        if (await cmd.ExecuteScalarAsync() is not byte[] blob)
            return TypedResults.NotFound();

        ctx.Response.Headers.CacheControl = "public, max-age=86400";
        return TypedResults.File(blob, "image/png");
    }

    // icons.db lives with the web data. ContentRootPath varies by how the app is
    // launched (dotnet watch/run vs published), so try several bases × relative paths.
    static readonly string[] _rel =
    {
        "web/public/data/vh/icons.db",      // base = repo root
        "../web/public/data/vh/icons.db",   // base = api/ (dev)
        "wwwroot/data/vh/icons.db",         // base = published api (prod)
        "../wwwroot/data/vh/icons.db",
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
        log.LogWarning("item icons.db NOT FOUND. ContentRoot={CR} CWD={CWD}",
            env.ContentRootPath, Directory.GetCurrentDirectory());
        return null;
    }
}
