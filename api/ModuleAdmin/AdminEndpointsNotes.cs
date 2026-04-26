using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;

namespace ValHelpApi.ModuleAdmin;

public static class AdminEndpointsNotes
{
    static readonly Dictionary<string, string> PageDocs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["craft"] = "weapons_details",
        ["armor"] = "gear_details",
        ["comfort"] = "comfort_details",
        ["bestiary"] = "bestiary_details",
    };

    static readonly Regex CodePattern = new(@"^[A-Za-z0-9_\-]{1,64}$", RegexOptions.Compiled);

    internal static void Map(WebApplication app)
    {
        var api = app.MapGroup("api/admin/notes").RequireAuthorization();
        api.MapGet("{page}/{code}", GetNote);
        api.MapPut("{page}/{code}", PutNote);
    }

    static bool IsAdmin(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id == 1;

    static string? ResolveDocPath(IWebHostEnvironment env, string page)
    {
        if (!PageDocs.TryGetValue(page, out var name)) return null;
        // Source markdown lives in web/public/data/vh/docs (vite serves it in dev,
        // and the same tree is bundled for prod). Resolve relative to the api content root.
        var src = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "web", "public", "data", "vh", "docs", name + ".md"));
        if (File.Exists(src)) return src;
        var www = Path.Combine(env.ContentRootPath, "wwwroot", "data", "vh", "docs", name + ".md");
        if (File.Exists(www)) return www;
        return src; // path used for create-on-write
    }

    public static async Task<Results<Ok<NoteResp>, NotFound, ForbidHttpResult>> GetNote(
        ClaimsPrincipal user, IWebHostEnvironment env, string page, string code)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        if (!CodePattern.IsMatch(code)) return TypedResults.NotFound();
        var path = ResolveDocPath(env, page);
        if (path == null) return TypedResults.NotFound();
        var md = File.Exists(path) ? await File.ReadAllTextAsync(path) : "";
        var (heading, body) = ExtractSection(md, code);
        return TypedResults.Ok(new NoteResp(page, code, heading, body));
    }

    public static async Task<Results<Ok<NoteResp>, BadRequest<string>, NotFound, ForbidHttpResult>> PutNote(
        ClaimsPrincipal user, IWebHostEnvironment env, string page, string code, NoteReq req)
    {
        if (!IsAdmin(user)) return TypedResults.Forbid();
        if (!CodePattern.IsMatch(code)) return TypedResults.NotFound();
        if (req.Body == null) return TypedResults.BadRequest("Body required");
        if (req.Body.Length > 20000) return TypedResults.BadRequest("Too long (max 20000 chars)");
        var heading = (req.Heading ?? "").Trim();
        if (heading.Length == 0 || heading.Length > 200) return TypedResults.BadRequest("Heading required");
        if (heading.Contains('\n') || heading.Contains('\r') || heading.Contains("<!--") || heading.Contains("-->"))
            return TypedResults.BadRequest("Invalid heading");

        var path = ResolveDocPath(env, page);
        if (path == null) return TypedResults.NotFound();

        var md = File.Exists(path) ? await File.ReadAllTextAsync(path) : "";
        var updated = ReplaceSection(md, code, heading, req.Body);
        await File.WriteAllTextAsync(path, updated);
        var (h, b) = ExtractSection(updated, code);
        return TypedResults.Ok(new NoteResp(page, code, h, b));
    }

    static (string heading, string body) ExtractSection(string md, string code)
    {
        var lines = md.Replace("\r\n", "\n").Split('\n');
        var pattern = new Regex(@"^###\s+(.*?)<!--\s*" + Regex.Escape(code) + @"\s*-->\s*$");
        int start = -1;
        string heading = "";
        for (int i = 0; i < lines.Length; i++)
        {
            var m = pattern.Match(lines[i]);
            if (m.Success) { start = i + 1; heading = m.Groups[1].Value.Trim(); break; }
        }
        if (start < 0) return ("", "");
        var buf = new List<string>();
        for (int i = start; i < lines.Length; i++)
        {
            var t = lines[i].TrimStart();
            if (t.StartsWith("### ") || (t.StartsWith("## ") && !t.StartsWith("### "))) break;
            buf.Add(lines[i]);
        }
        return (heading, string.Join('\n', buf).Trim('\r', '\n', ' '));
    }

    static string ReplaceSection(string md, string code, string heading, string body)
    {
        var lines = md.Replace("\r\n", "\n").Split('\n').ToList();
        var pattern = new Regex(@"^###\s+.*?<!--\s*" + Regex.Escape(code) + @"\s*-->\s*$");
        int headIdx = -1;
        for (int i = 0; i < lines.Count; i++)
        {
            if (pattern.IsMatch(lines[i])) { headIdx = i; break; }
        }
        var headingLine = $"### {heading} <!-- {code} -->";
        var section = new List<string> { headingLine, "" };
        section.AddRange(body.Replace("\r\n", "\n").TrimEnd().Split('\n'));
        section.Add("");

        if (headIdx < 0)
        {
            if (lines.Count > 0 && !string.IsNullOrWhiteSpace(lines[^1])) lines.Add("");
            lines.AddRange(section);
        }
        else
        {
            int endIdx = lines.Count;
            for (int i = headIdx + 1; i < lines.Count; i++)
            {
                var t = lines[i].TrimStart();
                if (t.StartsWith("### ") || (t.StartsWith("## ") && !t.StartsWith("### ")))
                {
                    endIdx = i;
                    break;
                }
            }
            while (endIdx > headIdx + 1 && string.IsNullOrWhiteSpace(lines[endIdx - 1])) endIdx--;
            lines.RemoveRange(headIdx, endIdx - headIdx);
            lines.InsertRange(headIdx, section);
        }

        return string.Join('\n', lines);
    }

    public record NoteReq(string Heading, string Body);
    public record NoteResp(string Page, string Code, string Heading, string Body);
}
