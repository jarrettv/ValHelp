using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleWorlds;

/// <summary>
/// Admin overrides for how each map POI prefab renders, plus admin-uploaded icon
/// art. The code rules in web/src/components/poiIcons.ts are the defaults; a row
/// here replaces them for that prefab, so changes need no deploy. Biome variants
/// (alt biomes) get the same treatment over web/src/components/biomePatterns.ts.
///
///   GET    api/poi/config                 public — per-prefab and per-variant overrides + uploaded icon versions
///   GET    api/poi/icons/{name}.svg       public — an uploaded icon
///   PUT    api/admin/poi/settings         admin  — upsert one override (all-null deletes it)
///   PUT    api/admin/poi/altbiomes        admin  — upsert one variant's override (all-null deletes it)
///   DELETE api/admin/poi/settings         admin  — drop every override (back to the code defaults)
///   PUT    api/admin/poi/icons/{name}     admin  — upload/replace an icon
///   DELETE api/admin/poi/icons/{name}     admin
///
/// web/scripts/poi-sync.mjs pushes local icon edits with the X-Poi-Sync-Key
/// header (matching the POI_SYNC_KEY setting; unset turns these off):
///   PUT    api/admin/poi/sync/icons/{name}            upload/replace an icon
///   DELETE api/admin/poi/sync/icons/{name}
///   DELETE api/admin/poi/sync/icons?redundant=true    drop uploads identical to the deployed built-in
/// </summary>
public static class WorldsPoiConfig
{
    static readonly Regex PrefabPattern = new(@"^[A-Za-z0-9_# \-]{1,80}$", RegexOptions.Compiled);
    static readonly Regex IconNamePattern = new(@"^[a-z0-9][a-z0-9_\-]{0,39}$", RegexOptions.Compiled);
    static readonly Regex AltBiomePattern = new(@"^[A-Za-z0-9 \-]{1,60}$", RegexOptions.Compiled);
    static readonly Regex ColorPattern = new(@"^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);
    const int MaxSvgBytes = 64 * 1024;

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/poi/config", GetConfig);
        app.MapGet("api/poi/icons/{name}.svg", GetIcon);

        var admin = app.MapGroup("api/admin/poi").RequireAuthorization();
        admin.MapPut("settings", PutSetting);
        admin.MapDelete("settings", DeleteAllSettings);
        admin.MapPut("altbiomes", PutAltBiome);
        admin.MapPut("icons/{name}", PutIcon);
        admin.MapDelete("icons/{name}", DeleteIcon);

        // Key-authenticated (no cookie), for the poi-sync script.
        var sync = app.MapGroup("api/admin/poi/sync").AddEndpointFilter(async (ctx, next) =>
        {
            var config = ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            return HasSyncKey(config, ctx.HttpContext.Request) ? await next(ctx) : TypedResults.Forbid();
        });
        sync.MapPut("icons/{name}", (AppDbContext db, string name, IconReq req) => SaveIcon(db, name, req));
        sync.MapDelete("icons/{name}", (AppDbContext db, string name) => RemoveIcon(db, name));
        sync.MapDelete("icons", PruneIcons);
    }

    static bool HasSyncKey(IConfiguration config, HttpRequest req)
    {
        var expected = config["POI_SYNC_KEY"];
        var given = req.Headers["X-Poi-Sync-Key"].ToString();
        return !string.IsNullOrEmpty(expected) && !string.IsNullOrEmpty(given)
            && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(given));
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        (int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1)
        || user.IsInRole("admin");

    public record SettingDto(bool? Visible, string? Icon, string? Color, int? Lod);
    public record AltBiomeDto(bool? Visible, string? Color);
    public record ConfigResp(Dictionary<string, SettingDto> Prefabs, Dictionary<string, long> Icons, Dictionary<string, AltBiomeDto> AltBiomes);

    public static async Task<Ok<ConfigResp>> GetConfig(AppDbContext db, HttpContext ctx)
    {
        var settings = await db.PoiSettings.AsNoTracking().ToListAsync();
        var alts = await db.AltBiomeSettings.AsNoTracking().ToListAsync();
        var icons = await db.PoiIcons.AsNoTracking()
            .Select(i => new { i.Name, i.UpdatedAt })
            .ToListAsync();

        var prefabs = settings.ToDictionary(s => s.Prefab, s => new SettingDto(s.Visible, s.Icon, s.Color, s.Lod));

        // Tiny and admin-edited: always revalidate so changes show up on next load.
        ctx.Response.Headers.CacheControl = "no-cache";
        return TypedResults.Ok(new ConfigResp(prefabs,
            icons.ToDictionary(i => i.Name, i => new DateTimeOffset(i.UpdatedAt).ToUnixTimeMilliseconds()),
            alts.ToDictionary(a => a.Name, a => new AltBiomeDto(a.Visible, a.Color))));
    }

    public static async Task<Results<ContentHttpResult, NotFound>> GetIcon(AppDbContext db, HttpContext ctx, string name)
    {
        var icon = await db.PoiIcons.AsNoTracking().FirstOrDefaultAsync(i => i.Name == name);
        if (icon == null) return TypedResults.NotFound();

        // Uploaded SVG is served from our origin: lock it down in case it's ever
        // opened directly rather than through <img>/data: URLs (which never run script).
        ctx.Response.Headers.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'";
        ctx.Response.Headers.XContentTypeOptions = "nosniff";
        // URLs carry ?v=<updatedAt>, so a replaced icon gets a new URL.
        ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return TypedResults.Content(icon.Svg, "image/svg+xml");
    }

    public record SettingReq(string Prefab, bool? Visible, string? Icon, string? Color, int? Lod);

    public static async Task<Results<Ok<SettingDto>, NoContent, BadRequest<string>, ForbidHttpResult>> PutSetting(
        ClaimsPrincipal user, AppDbContext db, SettingReq req)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        if (req.Prefab == null || !PrefabPattern.IsMatch(req.Prefab)) return TypedResults.BadRequest("Invalid prefab");
        if (req.Icon != null && !IconNamePattern.IsMatch(req.Icon)) return TypedResults.BadRequest("Invalid icon name");
        if (req.Color != null && !ColorPattern.IsMatch(req.Color)) return TypedResults.BadRequest("Color must be #rrggbb");
        if (req.Lod is < 0 or > 3) return TypedResults.BadRequest("LOD must be 0-3");

        var row = await db.PoiSettings.FirstOrDefaultAsync(s => s.Prefab == req.Prefab);
        if (req.Visible == null && req.Icon == null && req.Color == null && req.Lod == null)
        {
            // Nothing overridden any more: back to the code default.
            if (row != null)
            {
                db.PoiSettings.Remove(row);
                await db.SaveChangesAsync();
            }
            return TypedResults.NoContent();
        }

        if (row == null)
        {
            row = new PoiSetting { Prefab = req.Prefab };
            db.PoiSettings.Add(row);
        }
        row.Visible = req.Visible;
        row.Icon = req.Icon;
        row.Color = req.Color?.ToLowerInvariant();
        row.Lod = req.Lod;
        row.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new SettingDto(row.Visible, row.Icon, row.Color, row.Lod));
    }

    public record AltBiomeReq(string Name, bool? Visible, string? Color);

    /// <summary>Show/hide a biome variant on the maps, or change its stroke colour (AltBiome.m_name).</summary>
    public static async Task<Results<Ok<AltBiomeDto>, NoContent, BadRequest<string>, ForbidHttpResult>> PutAltBiome(
        ClaimsPrincipal user, AppDbContext db, AltBiomeReq req)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        if (req.Name == null || !AltBiomePattern.IsMatch(req.Name)) return TypedResults.BadRequest("Invalid variant name");
        if (req.Color != null && !ColorPattern.IsMatch(req.Color)) return TypedResults.BadRequest("Color must be #rrggbb");

        var row = await db.AltBiomeSettings.FirstOrDefaultAsync(s => s.Name == req.Name);
        if (req.Visible == null && req.Color == null)
        {
            if (row != null)
            {
                db.AltBiomeSettings.Remove(row);
                await db.SaveChangesAsync();
            }
            return TypedResults.NoContent();
        }

        if (row == null)
        {
            row = new AltBiomeSetting { Name = req.Name };
            db.AltBiomeSettings.Add(row);
        }
        row.Visible = req.Visible;
        row.Color = req.Color?.ToLowerInvariant();
        row.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new AltBiomeDto(row.Visible, row.Color));
    }

    public record ResetResp(int Removed, string[] PrunedIcons);

    /// <summary>
    /// Reset every prefab to its code default and drop uploaded icons the deploy
    /// now ships itself, e.g. after a deploy folds the overrides into code.
    /// </summary>
    public static async Task<Results<Ok<ResetResp>, ForbidHttpResult>> DeleteAllSettings(
        ClaimsPrincipal user, AppDbContext db, IWebHostEnvironment env)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        var removed = await db.PoiSettings.ExecuteDeleteAsync();
        var pruned = await PruneRedundant(db, env);
        return TypedResults.Ok(new ResetResp(removed, pruned));
    }

    public record PruneResp(int Removed, string[] Names);

    static async Task<Results<Ok<PruneResp>, BadRequest<string>>> PruneIcons(
        AppDbContext db, IWebHostEnvironment env, bool redundant = false)
    {
        if (!redundant) return TypedResults.BadRequest("Only ?redundant=true is supported");
        var names = await PruneRedundant(db, env);
        return TypedResults.Ok(new PruneResp(names.Length, names));
    }

    /// <summary>Delete uploads identical (after sanitizing) to the built-in of the same name in wwwroot/img/Poi.</summary>
    static async Task<string[]> PruneRedundant(AppDbContext db, IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "img", "Poi");
        var redundant = new List<PoiIcon>();
        foreach (var icon in await db.PoiIcons.ToListAsync())
        {
            var path = Path.Combine(dir, icon.Name + ".svg");
            if (!File.Exists(path)) continue;
            try
            {
                if (SanitizeSvg(await File.ReadAllTextAsync(path)) == icon.Svg) redundant.Add(icon);
            }
            catch (Exception) { /* unreadable built-in: keep the upload */ }
        }
        db.PoiIcons.RemoveRange(redundant);
        await db.SaveChangesAsync();
        return redundant.Select(i => i.Name).OrderBy(n => n).ToArray();
    }

    public record IconReq(string Svg);
    public record IconResp(string Name, long Version);

    public static async Task<Results<Ok<IconResp>, BadRequest<string>, ForbidHttpResult>> PutIcon(
        ClaimsPrincipal user, AppDbContext db, string name, IconReq req)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        var r = await SaveIcon(db, name, req);
        return r.Result switch
        {
            Ok<IconResp> ok => ok,
            BadRequest<string> bad => bad,
            _ => throw new InvalidOperationException(),
        };
    }

    static async Task<Results<Ok<IconResp>, BadRequest<string>>> SaveIcon(AppDbContext db, string name, IconReq req)
    {
        if (!IconNamePattern.IsMatch(name)) return TypedResults.BadRequest("Name: lowercase letters, digits, - or _ (max 40)");
        if (string.IsNullOrWhiteSpace(req.Svg)) return TypedResults.BadRequest("SVG required");
        if (req.Svg.Length > MaxSvgBytes) return TypedResults.BadRequest($"SVG too large (max {MaxSvgBytes / 1024} KB)");

        string clean;
        try { clean = SanitizeSvg(req.Svg); }
        catch (Exception ex) { return TypedResults.BadRequest($"Not a valid SVG: {ex.Message}"); }

        var row = await db.PoiIcons.FirstOrDefaultAsync(i => i.Name == name);
        if (row == null)
        {
            row = new PoiIcon { Name = name };
            db.PoiIcons.Add(row);
        }
        row.Svg = clean;
        row.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return TypedResults.Ok(new IconResp(name, new DateTimeOffset(row.UpdatedAt).ToUnixTimeMilliseconds()));
    }

    public static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DeleteIcon(
        ClaimsPrincipal user, AppDbContext db, string name)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        var r = await RemoveIcon(db, name);
        return r.Result is NoContent ? TypedResults.NoContent() : TypedResults.NotFound();
    }

    static async Task<Results<NoContent, NotFound>> RemoveIcon(AppDbContext db, string name)
    {
        var row = await db.PoiIcons.FirstOrDefaultAsync(i => i.Name == name);
        if (row == null) return TypedResults.NotFound();
        db.PoiIcons.Remove(row);
        await db.SaveChangesAsync();
        return TypedResults.NoContent();
    }

    static readonly HashSet<string> BlockedElements = new(StringComparer.OrdinalIgnoreCase)
    {
        "script", "foreignObject", "iframe", "object", "embed", "audio", "video", "image", "use", "a", "animate", "set",
    };

    /// <summary>
    /// Parses the SVG (no DTDs) and strips anything that can execute or reach
    /// outside the document: script-ish elements, on* handlers, non-fragment
    /// hrefs and url()/javascript: values.
    /// </summary>
    internal static string SanitizeSvg(string svg)
    {
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
        using var reader = XmlReader.Create(new StringReader(svg), settings);
        var doc = XDocument.Load(reader);
        if (doc.Root == null || doc.Root.Name.LocalName != "svg")
            throw new InvalidDataException("root element must be <svg>");

        foreach (var el in doc.Descendants().Where(e => BlockedElements.Contains(e.Name.LocalName)).ToList())
            el.Remove();

        foreach (var el in doc.Root.DescendantsAndSelf())
        {
            foreach (var attr in el.Attributes().ToList())
            {
                var local = attr.Name.LocalName;
                var value = attr.Value;
                if (local.StartsWith("on", StringComparison.OrdinalIgnoreCase)
                    || (local == "href" && !value.StartsWith('#'))
                    || value.Contains("javascript:", StringComparison.OrdinalIgnoreCase)
                    || (value.Contains("url(", StringComparison.OrdinalIgnoreCase) && !value.Contains("url(#", StringComparison.OrdinalIgnoreCase)))
                    attr.Remove();
            }
        }

        // <style> blocks could import; drop any that reference external resources.
        foreach (var style in doc.Descendants().Where(e => e.Name.LocalName == "style").ToList())
            if (style.Value.Contains("@import", StringComparison.OrdinalIgnoreCase) || style.Value.Contains("url(", StringComparison.OrdinalIgnoreCase))
                style.Remove();

        return doc.Root.ToString(SaveOptions.DisableFormatting);
    }
}

public class PoiSetting
{
    /// <summary>Location prefab as emitted by seedgen, e.g. "Crypt2".</summary>
    public string Prefab { get; set; } = null!;
    public bool? Visible { get; set; }
    public string? Icon { get; set; }
    public string? Color { get; set; }
    /// <summary>Level of detail 0-3: zoom at which the POI turns from a dot into its icon.</summary>
    public int? Lod { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class AltBiomeSetting
{
    /// <summary>The game's AltBiome.m_name, e.g. "Mushroom".</summary>
    public string Name { get; set; } = null!;
    public bool? Visible { get; set; }
    /// <summary>Map stroke colour, #rrggbb.</summary>
    public string? Color { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PoiIcon
{
    public string Name { get; set; } = null!;
    public string Svg { get; set; } = null!;
    public DateTime UpdatedAt { get; set; }
}
