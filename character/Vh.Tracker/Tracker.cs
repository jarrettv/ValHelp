using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace Vh.Tracker;

/// <summary>
/// Watches the save folders and uploads each new save of an opted-in character
/// to POST api/char/upload (the site parses it). One worker thread does all the
/// work: woken a few seconds after the game writes a .fch, and every 10 minutes
/// as a fallback (which also picks up folders created after startup).
/// Saves are sent oldest first, so turning a character on also sends its backups
/// and gives the site its earlier history.
/// </summary>
public sealed class Tracker
{
    static readonly TimeSpan Debounce = TimeSpan.FromSeconds(5);
    static readonly TimeSpan IdleScan = TimeSpan.FromMinutes(10);
    static readonly TimeSpan RetryScan = TimeSpan.FromMinutes(2);
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string RunValue = "ValHelpTracker";

    readonly string configPath;
    readonly bool registerStartup;
    readonly Config config;
    readonly object gate = new();
    readonly AutoResetEvent wake = new(false);
    readonly Dictionary<string, FileSystemWatcher> watchers = new(StringComparer.OrdinalIgnoreCase);
    readonly HttpClient http;
    DateTime dueAt = DateTime.MinValue; // scan at startup
    volatile bool linking;
    string status = "Starting";
    DateTime? lastUpload;

    /// <summary>Raised on any thread when the status or menu contents change.</summary>
    public Action? Changed;
    /// <summary>Raised on any thread to show a notification (title, text, warning).</summary>
    public Action<string, string, bool>? Notify;

    public Tracker(string configPath, string? server, bool registerStartup)
    {
        this.configPath = configPath;
        this.registerStartup = registerStartup;
        config = Config.Load(configPath);
        if (server != null) config.Server = server.TrimEnd('/');
        http = new HttpClient(new SocketsHttpHandler
        {
            PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30),
            AutomaticDecompression = DecompressionMethods.None,
        })
        { Timeout = TimeSpan.FromMinutes(2) };
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ValHelpTracker", "0.1"));
    }

    public bool FirstRun { get; private set; }
    public bool Linked { get { lock (gate) return config.Token != null; } }
    public bool Linking => linking;
    public string Status { get { lock (gate) return status; } }
    public string PageUrl => config.Server + "/runs";
    public string Server => config.Server;
    public string DataDir => Path.GetDirectoryName(configPath)!;

    public void Start()
    {
        FirstRun = !File.Exists(configPath);
        lock (gate) Save();
        new Thread(Loop) { IsBackground = true, Name = "tracker" }.Start();
    }

    /// <summary>How many characters the menu offers: the most recently played.</summary>
    public const int MenuCharacters = 6;

    /// <summary>
    /// The most recently saved characters with whether each is tracked, for the
    /// menu. A tracked character stays listed even when older, so it can be unticked.
    /// </summary>
    public List<(CharacterSave Save, bool Enabled)> Characters()
    {
        var found = Saves.FindCharacters().OrderByDescending(c => File.GetLastWriteTimeUtc(c.Key)).ToList();
        lock (gate)
        {
            bool Tracked(CharacterSave c) => config.Characters.TryGetValue(c.Key, out var s) && s.Enabled;
            return found.Take(MenuCharacters).Concat(found.Skip(MenuCharacters).Where(Tracked))
                .Select(c => (c, Tracked(c))).ToList();
        }
    }

    public void Toggle(CharacterSave c)
    {
        lock (gate)
        {
            if (!config.Characters.TryGetValue(c.Key, out var s)) config.Characters[c.Key] = s = new CharacterState();
            s.Enabled = !s.Enabled;
            Log.Write($"{c.Display}: tracking {(s.Enabled ? "on" : "off")}");
            Save();
        }
        Kick(TimeSpan.Zero);
    }

    public void Unlink()
    {
        lock (gate)
        {
            config.Token = null;
            Save();
        }
        Log.Write("Unlinked");
        SetStatus("Not linked");
    }

    public static bool StartsWithWindows
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(RunValue) is string;
        }
        set
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (value) key.SetValue(RunValue, $"\"{Environment.ProcessPath}\"");
            else key.DeleteValue(RunValue, throwOnMissingValue: false);
        }
    }

    void Save() => config.Save(configPath);

    void SetStatus(string s)
    {
        lock (gate) status = s;
        Changed?.Invoke();
    }

    void Kick(TimeSpan after)
    {
        lock (gate)
        {
            var at = DateTime.UtcNow + after;
            if (at < dueAt) dueAt = at;
        }
        wake.Set();
    }

    void Loop()
    {
        while (true)
        {
            TimeSpan wait;
            lock (gate) wait = dueAt - DateTime.UtcNow;
            if (wait > TimeSpan.Zero)
            {
                wake.WaitOne(wait > IdleScan ? IdleScan : wait);
                continue;
            }
            lock (gate) dueAt = DateTime.UtcNow + IdleScan;
            bool retry;
            try
            {
                Watch();
                retry = Scan();
            }
            catch (Exception ex)
            {
                Log.Write($"Scan failed: {ex}");
                SetStatus("Error, see log");
                retry = true;
            }
            if (retry) Kick(RetryScan);
            Native.TrimWorkingSet();
        }
    }

    /// <summary>A watcher per character folder; any .fch change schedules a scan.</summary>
    void Watch()
    {
        foreach (var (dir, _) in Saves.CharacterDirs())
        {
            if (watchers.ContainsKey(dir)) continue;
            var w = new FileSystemWatcher(dir)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
                InternalBufferSize = 8192,
            };
            FileSystemEventHandler onChange = (_, e) =>
            {
                if (e.Name != null && e.Name.EndsWith(".fch", StringComparison.OrdinalIgnoreCase)) Kick(Debounce);
            };
            w.Created += onChange;
            w.Changed += onChange;
            w.Renamed += (_, e) => onChange(w, e);
            w.Error += (_, e) => { Log.Write($"Watcher error in {dir}: {e.GetException().Message}"); Kick(Debounce); };
            w.EnableRaisingEvents = true;
            watchers[dir] = w;
            Log.Write($"Watching {dir}");
        }
    }

    /// <summary>Sends every unsent save of every tracked character. True to retry soon.</summary>
    bool Scan()
    {
        string? token;
        List<(CharacterSave Save, CharacterState State)> tracked;
        lock (gate)
        {
            token = config.Token;
            var found = Saves.FindCharacters();
            tracked = found.Where(c => config.Characters.TryGetValue(c.Key, out var s) && s.Enabled)
                .Select(c => (c, config.Characters[c.Key])).ToList();
        }
        if (linking) return false;
        if (token == null)
        {
            SetStatus("Not linked");
            return false;
        }
        if (tracked.Count == 0)
        {
            SetStatus("No characters tracked");
            return false;
        }

        List<HintFile>? hints = null;
        int sent = 0;
        foreach (var (save, state) in tracked)
        {
            DateTime? after;
            lock (gate) after = state.Uploaded;
            foreach (var file in Saves.History(save).Where(f => after == null || f.Time > after))
            {
                hints ??= Saves.WorldHints();
                SetStatus($"Uploading {save.Name}");
                var result = Upload(token, file, hints);
                if (result == Result.Retry)
                {
                    SetStatus("Offline, retrying");
                    return true;
                }
                if (result == Result.Unauthorized)
                {
                    lock (gate)
                    {
                        if (config.Token == token) config.Token = null;
                        Save();
                    }
                    SetStatus("Not linked");
                    Notify?.Invoke("ValHelp Tracker", "This PC was unlinked from your account. Link it again from the tray menu.", true);
                    return false;
                }
                lock (gate)
                {
                    state.Uploaded = file.Time;
                    Save();
                }
                sent++;
            }
        }
        if (sent > 0) lastUpload = DateTime.Now;
        SetStatus(lastUpload is { } t ? $"Up to date, last upload {t:HH:mm}" : "Up to date");
        return false;
    }

    enum Result { Done, Retry, Unauthorized }

    Result Upload(string token, SaveFile file, List<HintFile> hints)
    {
        var raw = Saves.ReadShared(file.Path);
        if (raw == null) return Result.Done; // replaced or removed meanwhile; the next save follows
        byte[] gz;
        using (var ms = new MemoryStream())
        {
            using (var z = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true)) z.Write(raw);
            gz = ms.ToArray();
        }
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(gz), "file", Path.GetFileName(file.Path) + ".gz" },
            { new StringContent(file.Time.ToString("o")), "fileTime" },
        };
        foreach (var h in hints.Concat(Saves.WorldClocks(file.Time))) form.Add(new ByteArrayContent(h.Bytes), h.Field, h.Name);
        using var req = new HttpRequestMessage(HttpMethod.Post, config.Server + "/api/char/upload") { Content = form };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        try
        {
            using var resp = http.Send(req);
            var body = ReadBody(resp);
            if (resp.StatusCode == HttpStatusCode.Unauthorized)
            {
                Log.Write("Upload refused: token no longer valid");
                return Result.Unauthorized;
            }
            if ((int)resp.StatusCode >= 500 || resp.StatusCode == HttpStatusCode.TooManyRequests)
            {
                Log.Write($"Upload of {Path.GetFileName(file.Path)} failed: {(int)resp.StatusCode}, will retry");
                return Result.Retry;
            }
            if (!resp.IsSuccessStatusCode)
            {
                // The site can't use this file; don't send it again.
                Log.Write($"Upload of {Path.GetFileName(file.Path)} rejected ({(int)resp.StatusCode}): {Clip(body)}");
                return Result.Done;
            }
            var r = JsonSerializer.Deserialize(body, TrackerJson.Default.UploadResp);
            Log.Write($"Uploaded {Path.GetFileName(file.Path)} ({file.Time:u}, {gz.Length / 1024} KB): {r?.Status}"
                + (r?.Session is { } s ? $", session {s}" : ""));
            return Result.Done;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException or JsonException)
        {
            Log.Write($"Upload of {Path.GetFileName(file.Path)} failed: {ex.Message}, will retry");
            return Result.Retry;
        }
    }

    static string ReadBody(HttpResponseMessage resp)
    {
        using var s = resp.Content.ReadAsStream();
        using var reader = new StreamReader(s, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    static string Clip(string s) => s.Length > 300 ? s[..300] + "..." : s;

    /// <summary>Device pairing: show a code, open the site's /link page, poll until approved.</summary>
    public void StartLink()
    {
        if (linking) return;
        linking = true;
        new Thread(LinkFlow) { IsBackground = true, Name = "link" }.Start();
    }

    void LinkFlow()
    {
        try
        {
            var start = Post("/api/char/device/start",
                JsonSerializer.Serialize(new StartReq(Environment.MachineName), TrackerJson.Default.StartReq),
                TrackerJson.Default.StartResp);
            if (start == null) throw new HttpRequestException("empty response");
            SetStatus($"Approve code {start.UserCode} in your browser");
            Notify?.Invoke("Link ValHelp Tracker", $"Sign in on the page that opened and confirm the code {start.UserCode}.", false);
            Log.Write($"Linking with code {start.UserCode}");
            // The site's own address, not the API's idea of it (behind a dev proxy that's another port).
            Native.Open($"{config.Server}/link?code={Uri.EscapeDataString(start.UserCode)}");

            var until = DateTime.UtcNow.AddSeconds(start.ExpiresIn);
            var body = JsonSerializer.Serialize(new TokenReq(start.DeviceCode), TrackerJson.Default.TokenReq);
            while (DateTime.UtcNow < until)
            {
                Thread.Sleep(TimeSpan.FromSeconds(Math.Max(2, start.Interval)));
                TokenResp? t;
                try { t = Post("/api/char/device/token", body, TrackerJson.Default.TokenResp); }
                catch (HttpRequestException) { continue; }
                if (t?.Status == "pending") continue;
                if (t?.Status == "approved" && t.Token != null)
                {
                    lock (gate)
                    {
                        config.Token = t.Token;
                        Save();
                    }
                    Log.Write("Linked");
                    if (FirstRun && registerStartup) StartsWithWindows = true;
                    bool any;
                    lock (gate) any = config.Characters.Values.Any(c => c.Enabled);
                    Notify?.Invoke("ValHelp Tracker linked",
                        any ? "Your tracked characters will upload now." : "Right-click the tray icon to choose which characters to track.", false);
                    return;
                }
                break;
            }
            Log.Write("Link code expired");
            Notify?.Invoke("ValHelp Tracker", "The link code expired. Choose \"Link to ValHelp account\" to try again.", true);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            Log.Write($"Linking failed: {ex.Message}");
            Notify?.Invoke("ValHelp Tracker", $"Couldn't reach {config.Server}. Try linking again later.", true);
        }
        finally
        {
            linking = false;
            Kick(TimeSpan.Zero);
        }
    }

    T? Post<T>(string path, string json, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> type)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, config.Server + path)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
        using var resp = http.Send(req);
        var body = ReadBody(resp);
        if (!resp.IsSuccessStatusCode) throw new HttpRequestException($"{(int)resp.StatusCode} {Clip(body)}");
        return JsonSerializer.Deserialize(body, type);
    }
}
