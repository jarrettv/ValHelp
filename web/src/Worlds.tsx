import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Navigate } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import WorldMap, { PoiMarker } from './components/WorldMap';
import PoiLegend from './components/PoiLegend';
import SeedControl from './components/SeedControl';
import PoiCard from './components/PoiCard';
import './Worlds.css';

interface VisitResp {
  seed: string;
  seedHash: number;
  status: 'queued' | 'processing' | 'done' | 'error' | 'unknown';
  estWait: string | null;
  queuePosition: number;
  error: string | null;
}

/// The seed Worlds opens on, and the only one anyone but the owner can see;
/// choosing a seed isn't open yet.
/// The API enforces the same (WorldsEndpoints.PublicSeed).
const PUBLIC_SEED = 'JVModsFun';

/// Only the site owner (user 1) can switch seeds for now.
function useIsOwner(enabled: boolean) {
  const { data: profile, isPending } = useQuery<{ id: number }>({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth/profile', { credentials: 'include' }).then(r => r.json()),
    enabled,
  });
  return { isOwner: profile?.id === 1, pending: enabled && isPending };
}

export default function Worlds() {
  const { seed } = useParams<{ seed?: string }>();
  const { status: auth } = useAuth();
  const { isOwner, pending } = useIsOwner(!!auth?.id);

  if (auth === null || pending) return <div className="worlds-page"><p>Loading…</p></div>;
  // Worlds always opens on the public seed; only the owner can switch from there.
  if (seed && seed !== PUBLIC_SEED && !isOwner) return <Navigate to="/worlds" replace />;
  const shown = seed ?? PUBLIC_SEED;
  return <WorldView key={shown} seed={shown} canChange={isOwner} />;
}

function WorldView({ seed, canChange }: { seed: string; canChange: boolean }) {
  const { status: auth } = useAuth();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  // POI card: follows the cursor on hover; a click pins it where it was clicked.
  type PoiAt = { poi: PoiMarker; x: number; y: number };
  const [hoverPoi, setHoverPoi] = useState<PoiAt | null>(null);
  const [pinnedPoi, setPinnedPoi] = useState<PoiAt | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [pois, setPois] = useState<PoiMarker[]>([]);
  const [hiddenIcons, setHiddenIcons] = useState<Set<string>>(new Set());

  // Initial visit + status polling. Logged out (public seed only) there's no
  // user to record the visit for, so it starts with a status check instead.
  const authReady = auth !== null;
  const loggedIn = !!auth?.id;
  useEffect(() => {
    if (!authReady) return;
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
        const first = await call(loggedIn ? 'visit' : 'status');
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
  }, [authReady, loggedIn, seed]);

  const baseUrl = useMemo(() => `/api/worlds/${encodeURIComponent(seed)}`, [seed]);
  // Forest is a single static tile shared across all seeds — reuse the existing track-map
  // endpoint (which serves wwwroot/forest.png and never touches track_maps).
  const forestUrl = useMemo(() => `/api/track/map/${encodeURIComponent(seed)}/forest`, [seed]);

  function close() { navigate('/'); }
  function toggleIcon(icon: string) {
    setHiddenIcons(prev => {
      const next = new Set(prev);
      if (next.has(icon)) next.delete(icon); else next.add(icon);
      return next;
    });
  }

  if (auth === null) return <div className="worlds-page"><p>Loading…</p></div>;

  const pending = visit?.status !== 'done';

  return (
    <div className="worlds-view-fullscreen" ref={viewRef}>
      <button className="worlds-view-close" onClick={close} title="Close map" aria-label="Close">&times;</button>

      <SeedControl
        seed={seed}
        canChange={canChange}
        onChange={s => navigate(`/worlds/${encodeURIComponent(s)}`)}
        className="worlds-seed-control"
      />

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
          onPoiClick={(poi, at) => setPinnedPoi(poi ? { poi, ...at } : null)}
          onPoiHover={setHoverPoi}
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

      {[pinnedPoi, hoverPoi && hoverPoi.poi !== pinnedPoi?.poi ? hoverPoi : null].map((at, i) => at && viewRef.current && (
        <PoiCard key={i ? 'hover' : 'pinned'} poi={at.poi} x={at.x} y={at.y}
          width={viewRef.current.clientWidth} height={viewRef.current.clientHeight}
          pinned={!i} onClose={() => setPinnedPoi(null)} />
      ))}

      <img src="/valheim-logo.webp" alt="Valheim Help" className="worlds-view-logo" onClick={close} />
    </div>
  );
}
