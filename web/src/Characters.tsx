import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import RunCard, { type RunItem } from './components/RunCard';
import { cancelThumbs } from './components/mapThumb';
import './Characters.css';

// Runs (character tracking) home: what it is, the tracker download, your
// tracked characters and the PCs linked to your account. ?player=<user id>
// lists another player's runs instead (characters are public).

export const TRACKER_DOWNLOAD = '/downloads/ValHelpTracker.exe';

interface Device { id: number; name: string; createdAt: string; lastSeenAt: string }

export default function Characters() {
  const { status } = useAuth();
  const loggedIn = !!status?.id;
  const player = Number(useSearchParams()[0].get('player')) || null;
  if (player && player !== status?.id) return (
    <div className="chars-page runs-page">
      <h1>Runs</h1>
      <PlayerRuns userId={player} />
    </div>
  );
  return (
    <div className="chars-page runs-page">
      <h1>Runs</h1>
      <p>
        Follow a character through a world: the map uncovers as they explore, with their map pins and gear,
        save by save across every play session. Places they haven&apos;t found stay hidden unless you ask for spoilers.
      </p>
      {status === null ? <p>Loading…</p> : loggedIn ? <Mine /> : (
        <p><a className="chars-btn" href="/api/auth/discord?returnUrl=%2Fruns">Log in with Discord</a> to track your characters.</p>
      )}
      <GetTracker />
    </div>
  );
}

function PlayerRuns({ userId }: { userId: number }) {
  const runs = useQuery({
    queryKey: ['char-player', userId],
    queryFn: () => fetch(`/api/char/players/${userId}`).then(r => r.json() as Promise<RunItem[]>),
  });
  return runs.isPending ? <p>Loading…</p> : !runs.data?.length ? <p>No tracked characters.</p> : <RunList runs={runs.data} />;
}

function RunList({ runs }: { runs: RunItem[] }) {
  useEffect(() => cancelThumbs, []);
  return <div className="run-list">{runs.map(r => <RunCard key={r.id} run={r} />)}</div>;
}

function Mine() {
  const chars = useQuery({
    queryKey: ['char-mine'],
    queryFn: () => fetch('/api/char/mine', { credentials: 'include' }).then(r => r.json() as Promise<RunItem[]>),
  });
  const devices = useQuery({
    queryKey: ['char-devices'],
    queryFn: () => fetch('/api/char/devices', { credentials: 'include' }).then(r => r.json() as Promise<Device[]>),
  });
  const qc = useQueryClient();

  async function revoke(d: Device) {
    if (!window.confirm(`Unlink ${d.name}? Its tracker stops uploading until it's linked again.`)) return;
    await fetch(`/api/char/devices/${d.id}`, { method: 'DELETE', credentials: 'include' });
    qc.invalidateQueries({ queryKey: ['char-devices'] });
  }

  return (
    <>
      <h2>Your characters</h2>
      {chars.isPending ? <p>Loading…</p> : !chars.data?.length ? (
        <p>None yet. Install the tracker below and tick the characters you want to follow.</p>
      ) : (
        <RunList runs={chars.data} />
      )}

      <h2>Linked PCs</h2>
      {devices.isPending ? <p>Loading…</p> : !devices.data?.length ? <p>No PC is linked yet.</p> : (
        <ul className="chars-devices">
          {devices.data.map(d => (
            <li key={d.id}>
              <span>{d.name}</span>
              <small>last seen {new Date(d.lastSeenAt).toLocaleString()}</small>
              <button onClick={() => revoke(d)}>Unlink</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function GetTracker() {
  return (
    <>
      <h2>The tracker</h2>
      <p>
        A small Windows app that sits in the system tray while you play. It sends the character saves you choose
        to this site whenever the game saves; nothing else on your PC is read. It needs nothing else installed and
        uses a few MB of memory.
      </p>
      <ol className="chars-steps">
        <li><Link to="/tracker">Download ValHelpTracker.exe</Link> (with its safety report) and run it.</li>
        <li>Your browser opens to link it: log in and confirm the code it shows.</li>
        <li>Right-click the tray icon and tick the characters to track. Their earlier backups are sent too, so the timeline starts before you installed it.</li>
      </ol>
    </>
  );
}
