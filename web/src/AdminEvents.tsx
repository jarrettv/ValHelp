import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { useAuth } from './contexts/AuthContext';
import './AdminEvents.css';

// Admin: how the world map is used (api ModuleWorlds/WorldsEvents.cs, sent by
// web/src/lib/analytics.ts). Sessions are random per-tab ids; no IPs are kept.

interface CountRow { key: string; count: number }
interface SeedRow { seed: string; generated: number; opened: number; sessions: number; avgGenerateSeconds: number | null }
interface Summary {
  days: number; events: number; sessions: number; loggedInUsers: number;
  kinds: CountRow[]; devices: CountRow[]; seeds: SeedRow[]; poiClicks: CountRow[];
  avgMaxZoom: number | null; zoomDepth: CountRow[]; sources: CountRow[]; poiHovers: CountRow[]; markerFilters: CountRow[];
}
interface EventRow { id: number; at: string; session: string; userId: number | null; kind: string; seed: string | null; device: string | null; data: string | null }

const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 403) throw new Error('Admin access required');
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  return r.json();
};

function Bars({ title, rows, empty = 'None yet.' }: { title: string; rows: CountRow[]; empty?: string }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="aev-card">
      <h3>{title}</h3>
      {rows.length === 0 ? <div className="aev-muted">{empty}</div> : (
        <ul className="aev-bars">
          {rows.map(r => (
            <li key={r.key}>
              <span className="aev-bar-key" title={r.key}>{r.key}</span>
              <span className="aev-bar"><span style={{ width: `${(r.count / max) * 100}%` }} /></span>
              <span className="aev-bar-n">{r.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminEvents() {
  const { status } = useAuth();
  const [days, setDays] = useState(7);
  const [kind, setKind] = useState('');
  const admin = status?.id === 1;
  const summary = useQuery<Summary>({ queryKey: ['admin-events-summary', days], queryFn: () => get(`/api/admin/worlds/usage/summary?days=${days}`), enabled: admin });
  const recent = useQuery<EventRow[]>({
    queryKey: ['admin-events-recent', kind],
    queryFn: () => get(`/api/admin/worlds/usage/recent?limit=200${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`),
    enabled: admin,
  });

  if (!admin) return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  if (summary.isLoading) return <Spinner />;
  if (summary.isError) return <div style={{ padding: '1rem', color: '#c66' }}>Error: {(summary.error as Error).message}</div>;
  const s = summary.data!;

  return (
    <div className="aev-page">
      <div className="aev-head">
        <h2>World usage</h2>
        <div className="aev-days">
          {[1, 7, 30, 90].map(d => (
            <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>{d === 1 ? '24 h' : `${d} days`}</button>
          ))}
        </div>
      </div>
      {s.events === 0 && <p className="aev-muted">No events yet. If this stays empty, run api/Migrations/WorldEvents.sql on this database.</p>}

      <div className="aev-stats">
        <div><b>{s.sessions.toLocaleString()}</b><span>sessions</span></div>
        <div><b>{s.loggedInUsers.toLocaleString()}</b><span>logged-in users</span></div>
        <div><b>{(s.kinds.find(k => k.key === 'generate_done')?.count ?? 0).toLocaleString()}</b><span>seeds generated in browsers</span></div>
        <div><b>{(s.kinds.find(k => k.key === 'world_open')?.count ?? 0).toLocaleString()}</b><span>maps opened</span></div>
        <div><b>{s.avgMaxZoom == null ? '–' : `${s.avgMaxZoom.toFixed(1)}x`}</b><span>average deepest zoom</span></div>
        <div><b>{(s.kinds.find(k => k.key === 'generate_error')?.count ?? 0).toLocaleString()}</b><span>generation errors</span></div>
      </div>

      <div className="aev-grid">
        <Bars title="Devices (per session)" rows={s.devices} />
        <Bars title="Deepest zoom per map view" rows={s.zoomDepth} />
        <Bars title="Maps opened, by source" rows={s.sources} />
        <Bars title="Most clicked POIs" rows={s.poiClicks} />
        <Bars title="Most hovered POIs" rows={s.poiHovers} />
        <Bars title="Marker filters" rows={s.markerFilters} />
        <Bars title="Events" rows={s.kinds} />
      </div>

      <div className="aev-card">
        <h3>Seeds</h3>
        {s.seeds.length === 0 ? <div className="aev-muted">None yet.</div> : (
          <table className="aev-table">
            <thead><tr><th>Seed</th><th>Generated</th><th>Opened</th><th>Sessions</th><th>Avg generate</th></tr></thead>
            <tbody>
              {s.seeds.map(r => (
                <tr key={r.seed}>
                  <td className="aev-mono">{r.seed}</td><td>{r.generated}</td><td>{r.opened}</td><td>{r.sessions}</td>
                  <td>{r.avgGenerateSeconds == null ? '–' : `${r.avgGenerateSeconds.toFixed(0)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="aev-card">
        <div className="aev-head">
          <h3>Recent events</h3>
          <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind">
            <option value="">All kinds</option>
            {s.kinds.map(k => <option key={k.key} value={k.key}>{k.key}</option>)}
          </select>
        </div>
        {recent.isLoading ? <Spinner /> : (
          <table className="aev-table">
            <thead><tr><th>When</th><th>Kind</th><th>Seed</th><th>Device</th><th>Session</th><th>Data</th></tr></thead>
            <tbody>
              {(recent.data ?? []).map(e => (
                <tr key={e.id}>
                  <td className="aev-muted aev-nowrap"><TimeAgo targetTime={new Date(e.at)} /></td>
                  <td className="aev-nowrap">{e.kind}</td>
                  <td className="aev-mono">{e.seed}</td>
                  <td>{e.device}</td>
                  <td className="aev-mono aev-muted" title={e.session}>
                    {e.session.slice(0, 8)}{e.userId != null && <> · <Link to={`/auth/users/${e.userId}`}>user {e.userId}</Link></>}
                  </td>
                  <td className="aev-mono aev-data">{e.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
