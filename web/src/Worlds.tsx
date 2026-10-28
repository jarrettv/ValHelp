import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import WorldMap, { PoiMarker } from './components/WorldMap';
import PoiLegend, { type LegendAction } from './components/PoiLegend';
import SeedControl, { type OpenSeed } from './components/SeedControl';
import { usePublicWorlds } from './components/publicWorlds';
import { usePinnedWorlds } from './components/pinnedWorlds';
import PoiCard from './components/PoiCard';
import WorldsFeedback from './components/WorldsFeedback';
import { generateWorld, type GenerateProgress } from './worldgen/generateWorld';
import { LOCAL_WORLD_LIMIT, deleteLocalWorld, getLocalWorld, listLocalWorlds, saveLocalWorld, type LocalWorldMeta } from './worldgen/localWorlds';
import { STAGE_LABELS, type WorldgenStage } from './worldgen/worldgenTypes';
import { track } from './lib/analytics';
import './Worlds.css';

// The world map. Where a seed's map comes from:
//   - the public worlds (and, for the site owner, any seed): the server (seedgen);
//   - anything else: generated in this browser (WebAssembly worldgen, ~1 min) and
//     kept on this device (worldgen/localWorlds.ts, up to LOCAL_WORLD_LIMIT), or
//     pinned to the account so other browsers generate it on first open.
// `?local=1` forces the browser path (the owner trying it on a server seed).

interface VisitResp {
  seed: string;
  seedHash: number;
  status: 'queued' | 'processing' | 'done' | 'error' | 'unknown';
  estWait: string | null;
  queuePosition: number;
  error: string | null;
}

/// Only the site owner (user 1) can open any seed on the server and manage the
/// public worlds (api WorldsPublic enforces it).
function useIsOwner(enabled: boolean) {
  const { data: profile, isPending } = useQuery<{ id: number }>({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth/profile', { credentials: 'include' }).then(r => r.json()),
    enabled,
  });
  return { isOwner: profile?.id === 1, pending: enabled && isPending };
}

/** Navigation state: start generating right away (the user just asked for this seed). */
interface WorldsNavState { generate?: boolean }

export default function Worlds() {
  const { seed } = useParams<{ seed?: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const { status: auth } = useAuth();
  const loggedIn = !!auth?.id;
  const { isOwner, pending } = useIsOwner(loggedIn);
  const { seeds: publicSeeds } = usePublicWorlds();
  const pins = usePinnedWorlds(loggedIn);

  if (auth === null || pending || !publicSeeds || !pins.loaded) return <div className="worlds-page"><p>Loading…</p></div>;
  const shown = seed ?? publicSeeds[0];
  const forceLocal = params.get('local') === '1';
  const server = !forceLocal && (publicSeeds.includes(shown) || isOwner);
  const autoGenerate = !!(location.state as WorldsNavState | null)?.generate || pins.pins.includes(shown);
  return server
    ? <ServerWorld key={`s:${shown}`} seed={shown} isOwner={isOwner} isPublic={publicSeeds.includes(shown)} />
    : <LocalWorld key={`l:${shown}`} seed={shown} isOwner={isOwner} pins={pins.pins} autoGenerate={autoGenerate} />;
}

// ── Server worlds: queue a visit and poll until seedgen has the map ──────────

function ServerWorld({ seed, isOwner, isPublic }: { seed: string; isOwner: boolean; isPublic: boolean }) {
  const { status: auth } = useAuth();
  const [visit, setVisit] = useState<VisitResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial visit + status polling. Logged out (public seed only) there's no
  // user to record the visit for, so it starts with a status check instead.
  const loggedIn = !!auth?.id;
  useEffect(() => {
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
  }, [loggedIn, seed]);

  const map = useMemo(() => ({
    baseUrl: `/api/worlds/${encodeURIComponent(seed)}`,
    // Forest is a single static tile shared across all seeds — reuse the existing track-map
    // endpoint (which serves wwwroot/forest.png and never touches track_maps).
    forestUrl: `/api/track/map/${encodeURIComponent(seed)}/forest`,
  }), [seed]);

  const overlay = error
    ? <div className="worlds-pending-msg error">{error}</div>
    : visit?.status === 'error'
      ? <div className="worlds-pending-msg error">{visit.error ?? 'Error'}</div>
      : visit?.status === 'queued'
        ? <div className="worlds-pending-msg">Queued{visit.estWait ? ` (~${visit.estWait})` : '…'}</div>
        : <div className="worlds-pending-msg">Generating world… (about 80 seconds)</div>;

  return (
    <WorldView seed={seed} source={isPublic ? 'public' : 'server'} isOwner={isOwner}
      map={visit?.status === 'done' ? map : null} overlay={visit?.status === 'done' ? null : overlay} />
  );
}

// ── Local worlds: from this device, or generated here ────────────────────────

type LocalState =
  | { kind: 'loading' }
  | { kind: 'offer' }
  | { kind: 'full'; worlds: LocalWorldMeta[] }
  | { kind: 'generating'; progress: GenerateProgress; started: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; urls: { biomes: string; mask: string; pois: string; altSectors: string; altGrid: string }; saveError?: string };

const STAGES: WorldgenStage[] = ['runtime', 'generator', 'textures', 'vectors', 'mask', 'locations', 'contents'];
/** Rough share of the total time per stage, for one overall progress bar. */
const STAGE_WEIGHT: Record<WorldgenStage, number> = { runtime: 3, generator: 3, textures: 22, vectors: 3, mask: 2, locations: 40, contents: 27 };

function overallFraction(p: GenerateProgress): number {
  let done = 0, total = 0;
  for (const s of STAGES) {
    total += STAGE_WEIGHT[s];
    if (STAGES.indexOf(s) < STAGES.indexOf(p.stage)) done += STAGE_WEIGHT[s];
    else if (s === p.stage) done += STAGE_WEIGHT[s] * p.fraction;
  }
  return done / total;
}

function LocalWorld({ seed, isOwner, pins, autoGenerate }: { seed: string; isOwner: boolean; pins: string[]; autoGenerate: boolean }) {
  const pinned = pins.includes(seed);
  const [state, setState] = useState<LocalState>({ kind: 'loading' });
  const [now, setNow] = useState(() => performance.now());
  const cancelRef = useRef<(() => void) | null>(null);
  const urlsRef = useRef<string[]>([]);

  function show(w: { bvec: ArrayBuffer; mask: Blob; pois: PoiMarker[]; altBiomes: string; altBiomeGrid: Blob }, saveError?: string) {
    const urls = {
      biomes: URL.createObjectURL(new Blob([w.bvec])),
      mask: URL.createObjectURL(w.mask),
      pois: URL.createObjectURL(new Blob([JSON.stringify(w.pois)], { type: 'application/json' })),
      altSectors: URL.createObjectURL(new Blob([w.altBiomes], { type: 'application/json' })),
      altGrid: URL.createObjectURL(w.altBiomeGrid),
    };
    urlsRef.current = Object.values(urls);
    setState({ kind: 'ready', urls, saveError });
  }

  async function start() {
    // Room on this device? Pinned worlds' copies don't count.
    if (!pinned) {
      const counted = (await listLocalWorlds().catch(() => [])).filter(w => w.seed !== seed && !pins.includes(w.seed));
      if (counted.length >= LOCAL_WORLD_LIMIT) { setState({ kind: 'full', worlds: counted }); return; }
    }
    const started = performance.now();
    setState({ kind: 'generating', progress: { stage: 'runtime', fraction: 0 }, started });
    track('generate_start', seed, { pinned });
    const job = generateWorld(seed, progress => setState({ kind: 'generating', progress, started }));
    cancelRef.current = job.cancel;
    try {
      const w = await job.result;
      cancelRef.current = null;
      const totalMs = Math.round(performance.now() - started);
      const t = w.timings;
      track('generate_done', seed, {
        totalMs, pois: w.pois.length,
        runtimeMs: Math.round(t.runtime ?? 0), terrainMs: Math.round((t.generator ?? 0) + (t.textures ?? 0) + (t.vectors ?? 0) + (t.mask ?? 0)),
        locationsMs: Math.round(t.locations ?? 0), contentsMs: Math.round(t.contents ?? 0),
        cores: navigator.hardwareConcurrency ?? null,
      });
      let saveError: string | undefined;
      try { await saveLocalWorld(w); }
      catch (e) { saveError = e instanceof Error ? e.message : String(e); }
      show(w, saveError);
    } catch (e) {
      cancelRef.current = null;
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'cancelled') return;
      track('generate_error', seed, { message: message.slice(0, 300) });
      setState({ kind: 'error', message });
    }
  }

  useEffect(() => {
    let alive = true;
    getLocalWorld(seed)
      .then(w => {
        if (!alive) return;
        if (w === 'stale') start();   // made by an older version: regenerate in place
        else if (w) show(w.data);
        else if (autoGenerate) start();
        else setState({ kind: 'offer' });
      })
      .catch(() => { if (alive) { if (autoGenerate) start(); else setState({ kind: 'offer' }); } });
    return () => {
      alive = false;
      cancelRef.current?.();
      urlsRef.current.forEach(URL.revokeObjectURL);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per seed (keyed by seed)

  useEffect(() => {
    if (state.kind !== 'generating') return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [state.kind]);

  const map = useMemo(() => state.kind === 'ready' ? {
    baseUrl: `/api/worlds/${encodeURIComponent(seed)}`,
    forestUrl: `/api/track/map/${encodeURIComponent(seed)}/forest`,
    poisUrl: state.urls.pois,
    assets: { biomes: state.urls.biomes, mask: state.urls.mask, altBiomes: { sectors: state.urls.altSectors, grid: state.urls.altGrid } },
  } : null, [state, seed]);

  let overlay: ReactNode = null;
  if (state.kind === 'loading') overlay = <div className="worlds-pending-msg">Loading…</div>;
  else if (state.kind === 'offer') overlay = (
    <div className="worlds-pending-msg worlds-gen">
      <div className="worlds-gen-title"><span className="worlds-gen-seed">{seed}</span> isn&apos;t on this device yet</div>
      <p>Generate it here, in your browser. It takes about a minute and uses this device&apos;s processor; the world is then kept on this device.</p>
      <button className="worlds-gen-btn" onClick={start}>Generate {seed}</button>
    </div>
  );
  else if (state.kind === 'full') overlay = (
    <FullOverlay seed={seed} worlds={state.worlds} onFreed={start} />
  );
  else if (state.kind === 'generating') {
    const p = state.progress;
    const pct = Math.round(overallFraction(p) * 100);
    overlay = (
      <div className="worlds-pending-msg worlds-gen" role="status" aria-live="polite">
        <div className="worlds-gen-title">Generating <span className="worlds-gen-seed">{seed}</span> on this device</div>
        <div className="worlds-gen-bar"><div style={{ width: `${pct}%` }} /></div>
        <div className="worlds-gen-stage">
          {STAGE_LABELS[p.stage]}{p.detail ? <span className="worlds-gen-muted"> · {p.detail}</span> : null}
          <span className="worlds-gen-time">{pct}% · {Math.round((now - state.started) / 1000)} s</span>
        </div>
        <p className="worlds-gen-muted">Keep this tab open as your world generates.</p>
      </div>
    );
  }
  else if (state.kind === 'error') overlay = (
    <div className="worlds-pending-msg worlds-gen error">
      <div className="worlds-gen-title">Couldn&apos;t generate {seed}</div>
      <p>{state.message}</p>
      <button className="worlds-gen-btn" onClick={start}>Try again</button>
    </div>
  );

  return (
    <WorldView seed={seed} source={pinned ? 'pinned' : 'local'} isOwner={isOwner} map={map} overlay={overlay}
      notice={state.kind === 'ready' && state.saveError ? `Shown, but couldn't be kept on this device (${state.saveError}).` : undefined} />
  );
}

/** This device holds its limit of worlds: remove one to make room. */
function FullOverlay({ seed, worlds, onFreed }: { seed: string; worlds: LocalWorldMeta[]; onFreed: () => void }) {
  const [busy, setBusy] = useState(false);
  async function remove(s: string) {
    setBusy(true);
    try { await deleteLocalWorld(s); track('local_delete', s, { reason: 'full' }); onFreed(); }
    finally { setBusy(false); }
  }
  return (
    <div className="worlds-pending-msg worlds-gen">
      <div className="worlds-gen-title">This device holds {LOCAL_WORLD_LIMIT} worlds</div>
      <p>Remove one to make room for <span className="worlds-gen-seed">{seed}</span>:</p>
      <ul className="worlds-gen-list">
        {worlds.map(w => (
          <li key={w.seed}>
            <span className="worlds-gen-seed">{w.seed}</span>
            <button className="worlds-gen-btn small" disabled={busy} onClick={() => remove(w.seed)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── The map view, whatever the source ────────────────────────────────────────

export type WorldSource = 'public' | 'server' | 'local' | 'pinned';

interface MapProps { baseUrl: string; forestUrl: string; poisUrl?: string; assets?: ComponentProps<typeof WorldMap>['assets'] }

function WorldView({ seed, source, isOwner, map, overlay, notice }: {
  seed: string; source: WorldSource; isOwner: boolean; map: MapProps | null; overlay: ReactNode; notice?: string;
}) {
  const navigate = useNavigate();
  // POI card: follows the cursor on hover; a click pins it where it was clicked.
  type PoiAt = { poi: PoiMarker; x: number; y: number };
  const [hoverPoi, setHoverPoi] = useState<PoiAt | null>(null);
  const [pinnedPoi, setPinnedPoi] = useState<PoiAt | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [pois, setPois] = useState<PoiMarker[]>([]);
  const [hiddenIcons, setHiddenIcons] = useState<Set<string>>(new Set());

  // Usage: one view_end per map shown, with how deep it was zoomed and what was clicked.
  const view = useRef({ opened: 0, maxZoom: 1, clicks: 0, hovers: 0, filters: 0 });
  const hovers = useRef(new HoverTally());
  const shown = !!map;
  useEffect(() => {
    if (!shown) return;
    const v = view.current = { opened: performance.now(), maxZoom: 1, clicks: 0, hovers: 0, filters: 0 };
    const tally = hovers.current = new HoverTally();
    track('world_open', seed, { source });
    // Hovers are counted here and sent as one poi_hovers event every HOVER_FLUSH_MS.
    const flushHovers = () => tally.flush(seed);
    const timer = setInterval(flushHovers, HOVER_FLUSH_MS);
    const end = () => {
      if (!v.opened) return;
      tally.cancel();
      flushHovers();
      track('view_end', seed, {
        source, maxZoom: Math.round(v.maxZoom * 10) / 10, clicks: v.clicks, hovers: tally.total, filters: v.filters,
        seconds: Math.round((performance.now() - v.opened) / 1000),
      });
      v.opened = 0;
    };
    addEventListener('pagehide', end);
    return () => { clearInterval(timer); removeEventListener('pagehide', end); end(); };
  }, [shown, seed, source]);
  function onLegendAction(a: LegendAction) {
    if (a.action !== 'panel') view.current.filters++;
    track(a.action === 'panel' ? 'markers_panel' : 'marker_filter', seed, a);
  }

  function close() { navigate('/'); }

  // Maximize: hide the site header (body.map-open, index.css) so the map fills the window.
  // Remembered per browser; Escape restores.
  const [maximized, setMaximized] = useState(readMaximized);
  useEffect(() => {
    document.body.classList.toggle('map-open', maximized);
    try { localStorage.setItem(MAXIMIZED_KEY, maximized ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!maximized) return () => document.body.classList.remove('map-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('input, textarea, .seed-control, .wfb'))) setMaximized(false);
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('map-open'); };
  }, [maximized]);
  function toggleMaximized() {
    track('maximize', seed, { on: !maximized });
    setMaximized(m => !m);
  }
  function toggleIcon(icon: string) {
    setHiddenIcons(prev => {
      const next = new Set(prev);
      if (next.has(icon)) next.delete(icon); else next.add(icon);
      return next;
    });
  }
  function open(s: string, how: OpenSeed) {
    navigate(`/worlds/${encodeURIComponent(s)}${how.local ? '?local=1' : ''}`, { state: { generate: how.generate } satisfies WorldsNavState });
  }

  return (
    <div className="worlds-view-fullscreen" ref={viewRef}>
      <button className="worlds-view-max" onClick={toggleMaximized} aria-pressed={maximized}
              title={maximized ? 'Restore (show the site menu)' : 'Maximize (hide the site menu)'}
              aria-label={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <WorldsFeedback seed={seed} className="worlds-feedback" />

      <SeedControl seed={seed} source={source} isOwner={isOwner} onOpen={open}
        onRemoved={s => { if (s === seed) navigate('/worlds'); }} className="worlds-seed-control" />

      {overlay && <div className="worlds-pending-overlay">{overlay}</div>}
      {notice && <div className="worlds-notice">{notice}</div>}

      {map && (
        <WorldMap
          seed={seed}
          baseUrl={map.baseUrl}
          forestUrl={map.forestUrl}
          poisUrl={map.poisUrl}
          assets={map.assets}
          onPoiClick={(poi, at) => {
            setPinnedPoi(poi ? { poi, ...at } : null);
            if (poi) { view.current.clicks++; track('poi_click', seed, { prefab: poi.prefab ?? null, type: poi.type }); }
          }}
          onPoiHover={h => { setHoverPoi(h); hovers.current.hover(h?.poi ?? null); }}
          onZoom={z => { if (z > view.current.maxZoom) view.current.maxZoom = z; }}
          hiddenIcons={hiddenIcons}
          onPoisLoaded={setPois}
          className="worlds-fullmap"
        />
      )}

      {map && (
        <PoiLegend
          pois={pois}
          hiddenIcons={hiddenIcons}
          onToggle={toggleIcon}
          onAction={onLegendAction}
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

const MAXIMIZED_KEY = 'vh-worlds-maximized';
function readMaximized(): boolean {
  try { return localStorage.getItem(MAXIMIZED_KEY) === '1'; } catch { return false; }
}

const MaximizeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
  </svg>
);
const RestoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" />
  </svg>
);

// ── POI hover tally ──────────────────────────────────────────────────────────
// People hover many POIs, so hovers aren't sent one by one: a hover counts once
// the card has been up for HOVER_MIN_MS (not just the cursor passing over),
// and the counts per prefab go out as one poi_hovers event per HOVER_FLUSH_MS.

const HOVER_MIN_MS = 300;
const HOVER_FLUSH_MS = 30_000;
const HOVER_TOP = 40;   // prefabs per event (keeps it under the server's size cap)

class HoverTally {
  total = 0;
  private counts = new Map<string, number>();
  private current: PoiMarker | null = null;
  private timer: number | undefined;

  hover(poi: PoiMarker | null) {
    if (poi === this.current) return;
    this.cancel();
    this.current = poi;
    if (!poi) return;
    this.timer = window.setTimeout(() => {
      const key = poi.prefab ?? poi.type;
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      this.total++;
    }, HOVER_MIN_MS);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.current = null;
  }

  /** Send what's been counted since the last flush, if anything. */
  flush(seed: string) {
    if (this.counts.size === 0) return;
    const top = [...this.counts].sort((a, b) => b[1] - a[1]).slice(0, HOVER_TOP);
    let n = 0;
    for (const [, c] of this.counts) n += c;
    track('poi_hovers', seed, { n, distinct: this.counts.size, counts: Object.fromEntries(top) });
    this.counts.clear();
  }
}
