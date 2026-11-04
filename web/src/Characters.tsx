import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import { formatPlay } from './components/CharTimeline';
import './Characters.css';

// Character tracking home: what it is, the tracker download, your tracked
// characters and the PCs linked to your account.

export const TRACKER_DOWNLOAD = '/downloads/ValHelpTracker.exe';

interface MineItem {
  id: number; name: string; latestFileTime: string; snapshots: number; sessions: number; playSeconds: number;
  worlds: { id: number; name: string | null; seed: string | null; needsSeed: boolean }[];
}
interface Device { id: number; name: string; createdAt: string; lastSeenAt: string }

export default function Characters() {
  const { status } = useAuth();
  const loggedIn = !!status?.id;
  return (
    <div className="chars-page">
      <h1>Character tracking</h1>
      <p>
        Follow a character through a world: the map uncovers as they explore, with their path and map pins,
        save by save across every play session. Places they haven&apos;t found stay hidden unless you ask for spoilers.
      </p>
      {status === null ? <p>Loading…</p> : loggedIn ? <Mine /> : (
        <p><a className="chars-btn" href="/api/auth/discord?returnUrl=%2Fcharacters">Log in with Discord</a> to track your characters.</p>
      )}
      <GetTracker />
    </div>
  );
}

function Mine() {
  const chars = useQuery({
    queryKey: ['char-mine'],
    queryFn: () => fetch('/api/char/mine', { credentials: 'include' }).then(r => r.json() as Promise<MineItem[]>),
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
        <ul className="chars-list">
          {chars.data.map(c => (
            <li key={c.id}>
              <Link to={`/characters/${c.id}`} className="chars-card">
                <div className="chars-card-name">{c.name}</div>
                <div className="chars-card-meta">
                  {formatPlay(c.playSeconds)} played · {c.sessions} session{c.sessions === 1 ? '' : 's'} · {c.snapshots} saves
                </div>
                <div className="chars-card-worlds">
                  {c.worlds.map(w => (
                    <span key={w.id} className={w.needsSeed ? 'needs-seed' : ''} title={w.needsSeed ? 'Seed unknown: open to enter it' : w.seed ?? ''}>
                      {w.name ?? 'Unnamed world'}{w.needsSeed ? ' (seed?)' : ''}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
        <li><a href={TRACKER_DOWNLOAD} download>Download ValHelpTracker.exe</a> and run it.</li>
        <li>Your browser opens to link it: log in and confirm the code it shows.</li>
        <li>Right-click the tray icon and tick the characters to track. Their earlier backups are sent too, so the timeline starts before you installed it.</li>
      </ol>
    </>
  );
}
