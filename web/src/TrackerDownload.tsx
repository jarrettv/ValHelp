import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { TRACKER_DOWNLOAD } from './Characters';
import './Characters.css';

// /tracker: the tracker download with a short safety report, what CI says about
// the build (ValHelpTracker.json, written next to the exe), and how to check the
// file yourself. The report describes character/Vh.Tracker as reviewed on the
// date below; re-read the code and update it when the tracker changes what it
// reads, sends or writes.

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

  return (
    <div className="chars-page tracker-page">
      <h1>ValHelp Tracker</h1>
      <p>
        A small Windows tray app for <Link to="/runs">Runs</Link>. Whenever Valheim saves a character you&apos;ve
        chosen, it sends that save here so the site can draw the map you&apos;ve uncovered, your gear and your
        timeline. You don&apos;t need to install anything else, and it uses a few MB of memory.
      </p>

      <div className="tracker-get">
        <a className="chars-btn" href={TRACKER_DOWNLOAD} download>Download ValHelpTracker.exe</a>
        <span className="tracker-meta">
          {m ? <>v{m.version} · {(m.size / 1048576).toFixed(1)} MB · Windows 10/11, 64-bit</> : 'Windows 10/11, 64-bit'}
        </span>
      </div>
      <ol className="chars-steps">
        <li>Run it. Your browser opens to link it to your account: log in and confirm the code it shows.</li>
        <li>Right-click the tray icon and tick the characters to track.</li>
      </ol>
      {m && !m.signed && (
        <p className="tracker-note">
          This build isn&apos;t code-signed yet, so Windows may show &ldquo;Windows protected your PC&rdquo;. Choose
          <strong> More info</strong>, then <strong>Run anyway</strong>, or check the file first with the steps below.
        </p>
      )}

      <h2>Safety report</h2>
      <p className="tracker-reviewed">From a review of the source code on {REVIEWED}.</p>
      <ul className="tracker-audit">
        <li>
          <strong>No admin rights.</strong> It runs as you and never asks for permission to change your PC. It has
          no installer, no driver and no background service.
        </li>
        <li>
          <strong>Reads only Valheim&apos;s save folders</strong> (<code>characters_local</code>,{' '}
          <code>characters</code> and Steam cloud saves), and opens files read-only. It never changes or deletes a save.
        </li>
        <li>
          <strong>Sends only what you tick:</strong> the save files of the characters you chose, including their
          backups. It also sends your worlds&apos; small <code>.fwl</code> files, so the site can tell which seed each
          one is, plus the first 12 bytes of a world save, which hold the in-game clock. Your PC&apos;s name is sent
          once, when you link it.
        </li>
        <li>
          <strong>Talks to one place:</strong> valheim.help over HTTPS. It sends no analytics, has no ads and no
          auto-update, and never downloads or runs code. The only other things it opens are this site in your browser
          and its own log file.
        </li>
        <li>
          <strong>No password stored.</strong> You approve the link in your browser and the app gets a random
          token. The site keeps only a hash of that token. You can unlink the PC from the tray menu or
          from <Link to="/runs">Runs</Link> at any time.
        </li>
        <li>
          <strong>Easy to remove.</strong> It writes only a settings file and a log (capped at 512 KB) in{' '}
          <code>%LOCALAPPDATA%\ValHelp\Tracker</code>, plus a &ldquo;Start with Windows&rdquo; entry you can untick.
          To remove it, untick that entry, exit, and delete the exe and that folder.
        </li>
        <li>
          <strong>Open source.</strong> About 1,000 lines of C# under GPL-3.0, with no third-party packages.
          The exe is built by GitHub Actions from the <a href={SOURCE}>public code</a> each time the site is updated.
          {m && <> This download is from commit{' '}
            <a href={`https://github.com/jarrettv/ValHelp/tree/${m.commit}/character/Vh.Tracker`}><code>{m.commit.slice(0, 7)}</code></a>
            {m.signed ? <>, signed by {m.signer ?? 'ValHelp'}.</> : '.'}
          </>}
        </li>
      </ul>

      <h2>Check it yourself</h2>
      {m ? (
        <>
          <p>The SHA-256 fingerprint of this download:</p>
          <code className="tracker-hash">{m.sha256}</code>
          <ul className="chars-steps">
            <li>
              In PowerShell, run <code>Get-FileHash .\ValHelpTracker.exe</code> in your Downloads folder. The hash
              should match the one above.
            </li>
            <li>
              Look it up on <a href={`https://www.virustotal.com/gui/file/${m.sha256}`} target="_blank" rel="noreferrer">VirusTotal</a>,
              which scans it with about 70 antivirus engines. If it says it hasn&apos;t seen the file yet, upload your copy there.
            </li>
            <li>
              Read the <a href={`https://github.com/jarrettv/ValHelp/tree/${m.commit}/character/Vh.Tracker`}>source for this build</a>,
              or build it yourself with <code>dotnet publish character/Vh.Tracker -c Release</code>.
            </li>
          </ul>
        </>
      ) : (
        <ul className="chars-steps">
          <li>
            Upload the file to <a href="https://www.virustotal.com/gui/home/upload" target="_blank" rel="noreferrer">VirusTotal</a>,
            which scans it with about 70 antivirus engines.
          </li>
          <li>
            Read the <a href={SOURCE}>source code</a>, or build it yourself
            with <code>dotnet publish character/Vh.Tracker -c Release</code>.
          </li>
        </ul>
      )}
    </div>
  );
}
