import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StoreBadge from './components/StoreBadge';
import { TRACKER_DOWNLOAD, TRACKER_STORE_APP } from './trackerLinks';
import './Characters.css';

// /tracker: get the tracker (Microsoft Store first), a short safety report, and
// for the direct download what CI says about the build (ValHelpTracker.json,
// written next to the exe) and how to check the file. The report describes
// character/Vh.Tracker as reviewed on the date below; re-read the code and
// update it when the tracker changes what it reads, sends or writes.

const MANIFEST = '/downloads/ValHelpTracker.json';
const SOURCE = 'https://github.com/jarrettv/ValHelp/tree/main/character/Vh.Tracker';
const REVIEWED = '2026-11-07';

interface Manifest {
  version: string;
  sha256: string;
  size: number;
  commit: string;
  builtAt: string;
  signed: boolean;
  signer: string | null;
}

export default function TrackerDownload() {
  const manifest = useQuery({
    queryKey: ['tracker-manifest'],
    queryFn: async () => {
      const r = await fetch(MANIFEST);
      if (!r.ok) return null;
      return await r.json() as Manifest;
    },
    staleTime: 5 * 60_000,
  });
  const m = manifest.data;
  const source = m ? `https://github.com/jarrettv/ValHelp/tree/${m.commit}/character/Vh.Tracker` : SOURCE;

  return (
    <div className="chars-page tracker-page">
      <h1>ValHelp Tracker</h1>
      <p>
        A Windows tray app for <Link to="/runs">Runs</Link>. When Valheim saves a character you picked, it uploads
        that save. Free, Windows 10/11, a few MB of memory.
      </p>

      <div className="tracker-get">
        <StoreBadge width={200} />
        <span className="tracker-meta">
          Updates through the Store. <a href={TRACKER_STORE_APP}>Open in the Store app</a>
        </span>
      </div>
      <ol className="chars-steps">
        <li>Install it, then open <strong>ValHelp Tracker</strong> from Start.</li>
        <li>Log in when your browser opens and confirm the code.</li>
        <li>Right-click the tray icon and tick the characters to track.</li>
      </ol>

      <h2>Safety</h2>
      <p className="tracker-reviewed">Source reviewed {REVIEWED}. See the <Link to="/privacy">privacy policy</Link>.</p>
      <ul className="tracker-audit">
        <li><strong>No admin rights</strong>, no driver, no background service.</li>
        <li>
          <strong>Reads only save folders</strong> (<code>characters_local</code>, <code>characters</code>, Steam
          cloud), read-only.
        </li>
        <li>
          <strong>Sends only what you tick:</strong> those characters&apos; saves and backups, your worlds&apos;
          small <code>.fwl</code> files (to tell the seed), and the in-game clock from each world save. Your PC&apos;s
          name once, when linking.
        </li>
        <li>
          <strong>Talks only to valheim.help</strong>, over HTTPS. No analytics, no ads, never downloads or runs code.
        </li>
        <li>
          <strong>No password stored.</strong> It holds a random token; the site keeps only its hash. Unlink any
          time from the tray or <Link to="/runs">Runs</Link>.
        </li>
        <li>
          <strong>Easy to remove:</strong> right-click it in Start, <strong>Uninstall</strong>. It only writes a
          settings file and a log (512 KB max).
        </li>
        <li>
          <strong>Open source:</strong> ~1,000 lines of C#, GPL-3.0, no third-party packages.{' '}
          <a href={SOURCE}>Read the code</a>.
        </li>
      </ul>

      <details className="tracker-direct">
        <summary>Direct download (not recommended)</summary>
        <p>
          A single <code>.exe</code> for PCs without the Store. It <strong>doesn&apos;t update itself</strong>: download
          it again for each new version. To remove it, turn off its Start with Windows entry, exit, and delete the exe
          and <code>%LOCALAPPDATA%\ValHelp\Tracker</code>.
        </p>
        <p>
          <a href={TRACKER_DOWNLOAD} download>Download ValHelpTracker.exe</a>
          {m && <span className="tracker-meta"> · v{m.version} · {(m.size / 1048576).toFixed(1)} MB</span>}
        </p>
        {m && !m.signed && (
          <p className="tracker-note">
            Not code-signed, so Windows may say &ldquo;Windows protected your PC&rdquo;: choose <strong>More info</strong>,
            then <strong>Run anyway</strong>.
          </p>
        )}
        <h3>Check the file</h3>
        {m && <code className="tracker-hash">SHA-256 {m.sha256}</code>}
        <ul className="chars-steps">
          {m && <li>PowerShell: <code>Get-FileHash .\ValHelpTracker.exe</code> should match.</li>}
          <li>
            Scan it on <a href={m ? `https://www.virustotal.com/gui/file/${m.sha256}` : 'https://www.virustotal.com/gui/home/upload'}
              target="_blank" rel="noreferrer">VirusTotal</a>.
          </li>
          <li>
            Built by GitHub Actions from <a href={source}>{m ? <>commit <code>{m.commit.slice(0, 7)}</code></> : 'the public code'}</a>
            {m?.signed ? <>, signed by {m.signer ?? 'ValHelp'}</> : null}. Build it yourself
            with <code>dotnet publish character/Vh.Tracker -c Release</code>.
          </li>
        </ul>
      </details>
    </div>
  );
}
