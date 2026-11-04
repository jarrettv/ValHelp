namespace Vh.Tracker;

/// <summary>
/// The notification-area icon: a hidden window receives its clicks; right-click
/// opens the menu, double-click the tracking page. Everything here runs on the
/// UI thread; the tracker posts WM_REFRESH when the tooltip or a notification
/// needs showing.
/// </summary>
sealed unsafe class Tray
{
    const uint WM_TRAY = Native.WM_APP + 1, WM_REFRESH = Native.WM_APP + 2;
    const uint IconId = 1;
    const int CmdOpen = 1, CmdLink = 2, CmdUnlink = 3, CmdStartup = 4, CmdLog = 5, CmdExit = 6, CmdAbout = 7, CmdCharacter = 100;
    const string SourceUrl = "https://github.com/jarrettv/ValHelp/tree/main/character/Vh.Tracker";
    const uint MB_YESNO = 0x04, MB_ICONINFORMATION = 0x40;
    const int IDYES = 6;

    static Tray? self;
    readonly Tracker tracker;
    readonly string logPath;
    readonly object gate = new();
    (string Title, string Text, bool Warning)? pendingNotice;
    nint hwnd, icon;
    uint taskbarCreated;

    public Tray(Tracker tracker, string logPath)
    {
        this.tracker = tracker;
        this.logPath = logPath;
        self = this;
        tracker.Changed = () => Native.PostMessageW(hwnd, WM_REFRESH, 0, 0);
        tracker.Notify = (title, text, warning) =>
        {
            lock (gate) pendingNotice = (title, text, warning);
            Native.PostMessageW(hwnd, WM_REFRESH, 0, 0);
        };
    }

    public void Run()
    {
        var instance = Native.GetModuleHandleW(null);
        fixed (char* cls = "ValHelpTracker")
        {
            var wc = new Native.WNDCLASSEXW
            {
                cbSize = (uint)sizeof(Native.WNDCLASSEXW),
                lpfnWndProc = &WndProc,
                hInstance = instance,
                lpszClassName = cls,
            };
            Native.RegisterClassExW(&wc);
            // A real (never shown) top-level window, so it gets "TaskbarCreated" when Explorer restarts.
            hwnd = Native.CreateWindowExW(0, cls, cls, 0, 0, 0, 0, 0, 0, 0, instance, 0);
        }
        taskbarCreated = Native.RegisterWindowMessageW("TaskbarCreated");
        icon = LoadIcon();
        AddIcon();

        Native.MSG msg;
        while (Native.GetMessageW(&msg, 0, 0, 0) > 0)
        {
            Native.TranslateMessage(&msg);
            Native.DispatchMessageW(&msg);
        }

        var data = Data();
        Native.Shell_NotifyIconW(Native.NIM_DELETE, &data);
    }

    static nint LoadIcon()
    {
        nint small = 0;
        if (Environment.ProcessPath is { } exe && Native.ExtractIconExW(exe, 0, null, &small, 1) > 0 && small != 0)
            return small;
        return Native.LoadIconW(0, 32512); // IDI_APPLICATION
    }

    Native.NOTIFYICONDATAW Data() => new()
    {
        cbSize = (uint)sizeof(Native.NOTIFYICONDATAW),
        hWnd = hwnd,
        uID = IconId,
    };

    void AddIcon()
    {
        var data = Data();
        data.uFlags = Native.NIF_MESSAGE | Native.NIF_ICON | Native.NIF_TIP;
        data.uCallbackMessage = WM_TRAY;
        data.hIcon = icon;
        Native.Copy(data.szTip, 128, Tip());
        Native.Shell_NotifyIconW(Native.NIM_ADD, &data);
    }

    string Tip() => "ValHelp Tracker\n" + tracker.Status;

    void Refresh()
    {
        var data = Data();
        data.uFlags = Native.NIF_TIP;
        Native.Copy(data.szTip, 128, Tip());
        (string Title, string Text, bool Warning)? notice;
        lock (gate)
        {
            notice = pendingNotice;
            pendingNotice = null;
        }
        if (notice is { } n)
        {
            data.uFlags |= Native.NIF_INFO;
            Native.Copy(data.szInfoTitle, 64, n.Title);
            Native.Copy(data.szInfo, 256, n.Text);
            data.dwInfoFlags = n.Warning ? Native.NIIF_WARNING : Native.NIIF_INFO;
        }
        Native.Shell_NotifyIconW(Native.NIM_MODIFY, &data);
    }

    void ShowMenu()
    {
        var characters = tracker.Characters();
        bool linked = tracker.Linked, startup = Tracker.StartsWithWindows;
        var menu = Native.CreatePopupMenu();
        Native.AppendMenuW(menu, Native.MF_GRAYED, 0, tracker.Status);
        Native.AppendMenuW(menu, Native.MF_SEPARATOR, 0, null);
        if (characters.Count == 0)
            Native.AppendMenuW(menu, Native.MF_GRAYED, 0, "No Valheim characters found");
        else
        {
            Native.AppendMenuW(menu, Native.MF_GRAYED, 0, "Track these characters (latest played):");
            for (int i = 0; i < characters.Count; i++)
                Native.AppendMenuW(menu, characters[i].Enabled ? Native.MF_CHECKED : Native.MF_STRING,
                    (nuint)(CmdCharacter + i), characters[i].Save.Display);
        }
        Native.AppendMenuW(menu, Native.MF_SEPARATOR, 0, null);
        Native.AppendMenuW(menu, Native.MF_STRING, CmdOpen, "Open tracking page");
        if (linked) Native.AppendMenuW(menu, Native.MF_STRING, CmdUnlink, "Unlink this PC");
        else Native.AppendMenuW(menu, tracker.Linking ? Native.MF_GRAYED : Native.MF_STRING, CmdLink, "Link to ValHelp account...");
        Native.AppendMenuW(menu, startup ? Native.MF_CHECKED : Native.MF_STRING, CmdStartup, "Start with Windows");
        Native.AppendMenuW(menu, Native.MF_STRING, CmdLog, "Open log");
        Native.AppendMenuW(menu, Native.MF_STRING, CmdAbout, "About ValHelp Tracker...");
        Native.AppendMenuW(menu, Native.MF_SEPARATOR, 0, null);
        Native.AppendMenuW(menu, Native.MF_STRING, CmdExit, "Exit (stop tracking)");

        Native.POINT p;
        Native.GetCursorPos(&p);
        Native.SetForegroundWindow(hwnd); // so the menu closes when clicking elsewhere
        int cmd = Native.TrackPopupMenu(menu, Native.TPM_RETURNCMD | Native.TPM_RIGHTBUTTON | Native.TPM_NONOTIFY, p.X, p.Y, 0, hwnd, 0);
        Native.PostMessageW(hwnd, Native.WM_NULL, 0, 0);
        Native.DestroyMenu(menu);

        switch (cmd)
        {
            case CmdOpen: Native.Open(tracker.PageUrl); break;
            case CmdLink: tracker.StartLink(); break;
            case CmdUnlink:
                if (Native.MessageBoxW(hwnd, "Stop uploading from this PC? You can link it again later.\n\nTo also revoke it on the site, remove it from your device list there.",
                        "ValHelp Tracker", Native.MB_ICONWARNING | 1 /* MB_OKCANCEL */) == 1)
                    tracker.Unlink();
                break;
            case CmdStartup: Tracker.StartsWithWindows = !startup; break;
            case CmdLog: if (File.Exists(logPath)) Native.Open(logPath); break;
            case CmdAbout: ShowAbout(); break;
            case CmdExit: Native.PostQuitMessage(0); break;
            case >= CmdCharacter when cmd - CmdCharacter < characters.Count:
                tracker.Toggle(characters[cmd - CmdCharacter].Save);
                break;
        }
        Refresh();
    }

    /// <summary>Exactly what the app reads, sends and changes, and where to check its source.</summary>
    void ShowAbout()
    {
        var v = typeof(Tray).Assembly.GetName().Version;
        var text = $"""
            ValHelp Tracker {v?.ToString(3)}

            What it does
            - Watches Valheim's character save folders (characters_local, characters, and Steam cloud saves).
            - When the game saves a character you ticked, it uploads that character's save file (.fch, gzipped) to {tracker.Server}. Ticking a character also sends its existing .old and backup saves, so the timeline starts earlier.
            - With each upload it sends the small world files (.fwl / .fwl2 and cacheMinimapMeta) so the site can tell which seed each world is.

            What it doesn't do
            - It never uploads characters you haven't ticked, or any other file: no screenshots, keystrokes, game memory or other programs.
            - It never changes your saves. It only reads them.
            - It talks to nothing but {tracker.Server}, using the link you approved there. Unlink it from the menu or from your account on the site.

            On this PC it keeps its settings and log in {tracker.DataDir}. "Start with Windows" adds it to your startup programs (HKCU Run).

            Source code: {SourceUrl}
            You can read it, and build the exe yourself with: dotnet publish character/Vh.Tracker -c Release

            Open the source code on GitHub?
            """;
        if (Native.MessageBoxW(hwnd, text, "About ValHelp Tracker", MB_YESNO | MB_ICONINFORMATION) == IDYES)
            Native.Open(SourceUrl);
    }

    [System.Runtime.InteropServices.UnmanagedCallersOnly]
    static nint WndProc(nint hwnd, uint msg, nint wParam, nint lParam)
    {
        try
        {
            if (self is { } t)
            {
                if (msg == WM_TRAY)
                {
                    var ev = (uint)(lParam & 0xFFFF);
                    if (ev is Native.WM_RBUTTONUP or Native.WM_CONTEXTMENU) t.ShowMenu();
                    else if (ev == Native.WM_LBUTTONDBLCLK) Native.Open(t.tracker.PageUrl);
                    return 0;
                }
                if (msg == WM_REFRESH)
                {
                    t.Refresh();
                    return 0;
                }
                if (msg == t.taskbarCreated && msg != 0)
                {
                    t.AddIcon();
                    return 0;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Write($"UI error: {ex}");
        }
        return Native.DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}
