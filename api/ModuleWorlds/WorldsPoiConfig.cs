using System.Security.Claims;
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
/// here replaces them for that prefab, so changes need no deploy.
///
///   GET    api/poi/config                 public — per-prefab overrides + uploaded icon versions
///   GET    api/poi/icons/{name}.svg       public — an uploaded icon
///   PUT    api/admin/poi/settings         admin  — upsert one override (all-null deletes it)
///   DELETE api/admin/poi/settings         admin  — drop every override (back to the code defaults)
///   PUT    api/admin/poi/icons/{name}     admin  — upload/replace an icon
///   DELETE api/admin/poi/icons/{name}     admin
/// </summary>
public static class WorldsPoiConfig
{
    static readonly Regex PrefabPattern = new(@"^[A-Za-z0-9_# \-]{1,80}$", RegexOptions.Compiled);
    static readonly Regex IconNamePattern = new(@"^[a-z0-9][a-z0-9_\-]{0,39}$", RegexOptions.Compiled);
    static readonly Regex ColorPattern = new(@"^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);
    const int MaxSvgBytes = 64 * 1024;

    internal static void Map(WebApplication app)
    {
        app.MapGet("api/poi/config", GetConfig);
        app.MapGet("api/poi/icons/{name}.svg", GetIcon);

        var admin = app.MapGroup("api/admin/poi").RequireAuthorization();
        admin.MapPut("settings", PutSetting);
        admin.MapDelete("settings", DeleteAllSettings);
        admin.MapPut("icons/{name}", PutIcon);
        admin.MapDelete("icons/{name}", DeleteIcon);
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        (int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1)
        || user.IsInRole("admin");

    public record SettingDto(bool? Visible, string? Icon, string? Color, int? Lod);
    public record ConfigResp(Dictionary<string, SettingDto> Prefabs, Dictionary<string, long> Icons);

    public static async Task<Ok<ConfigResp>> GetConfig(AppDbContext db, HttpContext ctx)
    {
        var settings = await db.PoiSettings.AsNoTracking().ToListAsync();
        var icons = await db.PoiIcons.AsNoTracking()
            .Select(i => new { i.Name, i.UpdatedAt })
            .ToListAsync();

        var prefabs = settings.ToDictionary(s => s.Prefab, s => new SettingDto(s.Visible, s.Icon, s.Color, s.Lod));

        // Tiny and admin-edited: always revalidate so changes show up on next load.
        ctx.Response.Headers.CacheControl = "no-cache";
        return TypedResults.Ok(new ConfigResp(prefabs,
            icons.ToDictionary(i => i.Name, i => new DateTimeOffset(i.UpdatedAt).ToUnixTimeMilliseconds())));
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

    public record ResetResp(int Removed);

    /// <summary>Reset every prefab to its code default, e.g. after a deploy folds the overrides into code.</summary>
    public static async Task<Results<Ok<ResetResp>, ForbidHttpResult>> DeleteAllSettings(ClaimsPrincipal user, AppDbContext db)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        var removed = await db.PoiSettings.ExecuteDeleteAsync();
        return TypedResults.Ok(new ResetResp(removed));
    }

    public record IconReq(string Svg);
    public record IconResp(string Name, long Version);

    public static async Task<Results<Ok<IconResp>, BadRequest<string>, ForbidHttpResult>> PutIcon(
        ClaimsPrincipal user, AppDbContext db, string name, IconReq req)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
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

public class PoiIcon
{
    public string Name { get; set; } = null!;
    public string Svg { get; set; } = null!;
    public DateTime UpdatedAt { get; set; }
}
