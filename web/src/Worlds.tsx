import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import WorldMap, { PoiMarker } from './components/WorldMap';
import PoiLegend from './components/PoiLegend';
import './Worlds.css';

interface WorldListItem {
  seed: string;
  createdAt: string;
  lastViewAt: string;
  viewCount: number;
}

interface VisitResp {
  seed: string;
  seedHash: number;
  status: 'queued' | 'processing' | 'done' | 'error' | 'unknown';
  estWait: string | null;
  queuePosition: number;
  error: string | null;
}

export default function Worlds() {
  const { seed } = useParams<{ seed?: string }>();
  return seed ? <WorldView seed={seed} /> : <WorldsIndex />;
}

function WorldsIndex() {
  const { status: auth } = useAuth();
  const navigate = useNavigate();
  const [seedInput, setSeedInput] = useState('');
  const [list, setList] = useState<WorldListItem[] | null>(null);

  const { data: profile, isPending: profilePending } = useQuery<{ id: number; roles?: string[] }>({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth/profile', { credentials: 'include' }).then(r => r.json()),
    enabled: !!auth?.id,
  });
  const isAdmin = !!profile && (profile.id === 1 || (profile.roles ?? []).includes('admin'));

  useEffect(() => {
    if (!auth?.id || !isAdmin) return;
    fetch('/api/worlds/list', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setList)
      .catch(() => setList([]));
  }, [auth?.id, isAdmin]);

  if (auth === null) return <div className="worlds-page"><p>Loading…</p></div>;
  if (auth.id && profilePending) return <div className="worlds-page"><p>Loading…</p></div>;
  if (!isAdmin) {
    return (
      <div className="worlds-page">
        <h1>Worlds</h1>
        <p>Coming soon.</p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = seedInput.trim();
    if (!s) return;
    navigate(`/worlds/${encodeURIComponent(s)}`);
  }

  return (
    <div className="worlds-page">
      <h1>Worlds</h1>
      <p>Enter a Valheim seed to view its map. Boss altars, traders, dungeons and POIs are extracted from a generated world.</p>
      <form className="worlds-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="Seed (e.g. HappyValheim)"
          value={seedInput}
          onChange={e => setSeedInput(e.target.value)}
          autoFocus
          maxLength={64}
        />
        <button type="submit" disabled={!seedInput.trim()}>View</button>
      </form>

      {list && list.length > 0 && (
        <div className="worlds-recent">
          <h2>Your worlds</h2>
          <ul>
            {list.map(w => (
              <li key={w.seed}>
                <Link to={`/worlds/${encodeURIComponent(w.seed)}`}>{w.seed}</Link>
                <span className="worlds-meta">
                  {w.viewCount} view{w.viewCount === 1 ? '' : 's'} · last {formatRelative(w.lastViewAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WorldView({ seed }: { seed: string }) {
  const { status: auth } = useAuth();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poi, setPoi] = useState<PoiMarker | null>(null);
  const [pois, setPois] = useState<PoiMarker[]>([]);
  const [hiddenIcons, setHiddenIcons] = useState<Set<string>>(new Set());

  // Initial visit + status polling
  useEffect(() => {
    if (!auth?.id) return;
    let cancelled = false;
    let timer: number | undefined;

    async function call(method: 'visit' | 'status') {
      const url = method === 'visit' ? '/api/worlds/visit' : `/api/worlds/status?seed=${encodeURIComponent(seed)}`;
      const init: RequestInit = method === 'visit'
        ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed }) }
        : { credentials: 'include' };
      const r = await fetch(url, init);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json() as VisitResp;
    }

    async function loop() {
      try {
        const first = await call('visit');
        if (cancelled) return;
        setVisit(first);
        if (first.status === 'done') return;

        const tick = async () => {
          if (cancelled) return;
          try {
            const next = await call('status');
            if (cancelled) return;
            setVisit(next);
            if (next.status !== 'done' && next.status !== 'error') {
              timer = window.setTimeout(tick, 5000);
            }
          } catch (e) {
            if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
          }
        };
        timer = window.setTimeout(tick, 5000);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
      }
    }
    loop();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [auth?.id, seed]);

  const baseUrl = useMemo(() => `/api/worlds/${encodeURIComponent(seed)}`, [seed]);
  // Forest is a single static tile shared across all seeds — reuse the existing track-map
  // endpoint (which serves wwwroot/forest.png and never touches track_maps).
  const forestUrl = useMemo(() => `/api/track/map/${encodeURIComponent(seed)}/forest`, [seed]);

  function close() { navigate('/worlds'); }
  function toggleIcon(icon: string) {
    setHiddenIcons(prev => {
      const next = new Set(prev);
      if (next.has(icon)) next.delete(icon); else next.add(icon);
      return next;
    });
  }

  if (auth === null) return <div className="worlds-page"><p>Loading…</p></div>;
  if (!auth.id) {
    return (
      <div className="worlds-page">
        <h1>Worlds</h1>
        <p>Log in to view this world.</p>
        <a className="worlds-login-btn" href="/api/auth/discord">Login with Discord</a>
      </div>
    );
  }

  const pending = visit?.status !== 'done';

  return (
    <div className="worlds-view-fullscreen">
      <button className="worlds-view-close" onClick={close} title="Close map" aria-label="Close">&times;</button>

      <div className="worlds-view-seed">{seed}</div>

      {pending && (
        <div className="worlds-pending-overlay">
          {error
            ? <div className="worlds-pending-msg error">{error}</div>
            : visit?.status === 'error'
              ? <div className="worlds-pending-msg error">{visit.error ?? 'Error'}</div>
              : visit?.status === 'queued'
                ? <div className="worlds-pending-msg">Queued{visit.estWait ? ` (~${visit.estWait})` : '…'}</div>
                : <div className="worlds-pending-msg">Generating world… (about 80 seconds)</div>
          }
        </div>
      )}

      {!pending && (
        <WorldMap
          seed={seed}
          baseUrl={baseUrl}
          forestUrl={forestUrl}
          onPoiClick={setPoi}
          hiddenIcons={hiddenIcons}
          onPoisLoaded={setPois}
          className="worlds-fullmap"
        />
      )}

      {!pending && (
        <PoiLegend
          pois={pois}
          hiddenIcons={hiddenIcons}
          onToggle={toggleIcon}
          className="worlds-legend"
        />
      )}

      {poi && (
        <aside className="worlds-poi-card" onClick={() => setPoi(null)}>
          <h3>{poi.name}</h3>
          <div className="worlds-poi-meta">{poi.type}{poi.prefab && poi.prefab !== poi.name ? ` · ${poi.prefab}` : ''}</div>
          <div className="worlds-poi-coords">{poi.x.toFixed(0)}, {poi.z.toFixed(0)}</div>
          {poi.items && poi.items.length > 0 && (
            <ul className="worlds-poi-items">
              {poi.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )}
        </aside>
      )}

      <img src="/valheim-logo.webp" alt="Valheim Help" className="worlds-view-logo" onClick={close} />
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
