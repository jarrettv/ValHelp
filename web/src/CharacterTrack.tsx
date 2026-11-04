import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import WorldMap, { type MapView, type PoiMarker } from './components/WorldMap';
import { worldToUnit } from './components/poiLayer';
import { Fog, parseTiles } from './components/charFog';
import CharTimeline, { formatPlay } from './components/CharTimeline';
import { Bars, Equipped, Foods, Inventory, exploredKm2, pctOfWorld, useItemIndex, type RunLatest } from './components/RunParts';
import './Characters.css';

// One tracked character on one of its worlds: the fog as it was at a save,
// the path between saves, the player's own map pins, and a timeline of saves
// along play time. Unexplored areas stay dark (and their POIs hidden) unless
// the viewer turns on spoilers.
//
// Built around a list of tracks so several characters on one world can share
// the map later; for now there is one.

export interface CharWorld { id: number; uid: number; name: string | null; seed: string | null; needsSeed: boolean; viewerPlays: boolean }
export interface CharSnapshot {
  id: number; fileTime: string; session: number; axis: number; rewind: boolean; worldId: number | null;
  x: number | null; z: number | null; explored: number | null;
}
interface CharResp {
  id: number; name: string; isMine: boolean;
  owner: { id: number; username: string; avatarUrl: string };
  worlds: CharWorld[]; snapshots: CharSnapshot[];
}
interface Vec3 { x: number; y: number; z: number }
interface Pin { name: string; pos: Vec3; type: number; typeName: string; checked: boolean; author: string }
interface WorldAt { uid: number; spawn: Vec3 | null; logout: Vec3 | null; death: Vec3 | null; home: Vec3; explored: number; pins: Pin[] }
interface MapStatus { status: string; seed: string | null; estWait: string | null; error: string | null }

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

const PIN_GLYPH: Record<string, string> = {
  Icon0: '🔥', Icon1: '🏠', Icon2: '🔨', Icon3: '•', Icon4: '🌀', Death: '💀', Bed: '🛏', Boss: '👑',
  Hildir1: '🛍', Hildir2: '🛍', Hildir3: '🛍', Memorial: '🪦',
};
const PATH_COLOR = '#ffb347';

/** /characters/:id, the first address of this page (the tracker opened it): now /runs/:id. */
export function CharacterRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  return <Navigate to={`/runs/${id}${search}`} replace />;
}

export default function CharacterTrack() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const char = useQuery({ queryKey: ['char', id], queryFn: () => getJson<CharResp>(`/api/char/${id}`) });

  if (char.isPending) return <div className="chars-page"><p>Loading…</p></div>;
  if (char.isError) return <div className="chars-page"><h1>Character not found</h1><p><Link to="/runs">Runs</Link></p></div>;
  const c = char.data;
  if (c.worlds.length === 0)
    return <div className="chars-page"><h1>{c.name}</h1><p>No explored worlds uploaded yet.</p></div>;
  const worldParam = Number(params.get('world'));
  const world = c.worlds.find(w => w.id === worldParam) ?? c.worlds[0];
  const save = c.snapshots.findIndex(s => s.id === Number(params.get('save')));
  return <TrackView key={world.id} char={c} world={world} initialIndex={save >= 0 ? save : c.snapshots.length - 1}
    onWorld={w => setParams(p => { p.set('world', String(w)); return p; }, { replace: true })} />;
}

function TrackView({ char, world, initialIndex, onWorld }: {
  char: CharResp; world: CharWorld; initialIndex: number; onWorld: (id: number) => void;
}) {
  const snaps = char.snapshots;
  const [index, setIndex] = useState(initialIndex);
  const snap = snaps[Math.max(0, Math.min(index, snaps.length - 1))];
  const [spoilers, setSpoilers] = useState(false);

  const status = useQuery({
    queryKey: ['char-map', world.id],
    queryFn: () => getJson<MapStatus>(`/api/char/worlds/${world.id}/map`),
    refetchInterval: q => (q.state.data && ['queued', 'processing'].includes(q.state.data.status) ? 10000 : false),
  });
  const tiles = useQuery({
    queryKey: ['char-tiles', char.id, world.id],
    queryFn: async () => {
      const r = await fetch(`/api/char/${char.id}/worlds/${world.id}/tiles`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Fog(parseTiles(await r.arrayBuffer()));
    },
    staleTime: Infinity,
  });
  // The character at the selected save: vitals, food, inventory.
  const player = useQuery({
    queryKey: ['char-player', char.id, snap.id],
    queryFn: () => getJson<RunLatest>(`/api/char/${char.id}/snapshots/${snap.id}/player`),
    placeholderData: prev => prev,
    staleTime: Infinity,
  });
  const items = useItemIndex();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('run-panel-expanded') === '1'; } catch { return false; }
  });
  function toggleExpanded() {
    setExpanded(e => {
      try { localStorage.setItem('run-panel-expanded', e ? '0' : '1'); } catch { /* private mode */ }
      return !e;
    });
  }

  const at = useQuery({
    queryKey: ['char-at', char.id, snap.id, world.id],
    queryFn: () => getJson<WorldAt>(`/api/char/${char.id}/snapshots/${snap.id}/worlds/${world.id}`).catch(() => null),
    placeholderData: prev => prev,
    staleTime: Infinity,
  });

  // The fog at the selected save, painted once per change.
  const fog = tiles.data;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fogImage, setFogImage] = useState<{ image: HTMLCanvasElement } | null>(null);
  const [fogAt, setFogAt] = useState(-1);
  useEffect(() => {
    if (!fog) return;
    const raf = requestAnimationFrame(() => {
      fog.seek(snap.id);
      canvasRef.current ??= document.createElement('canvas');
      fog.paint(canvasRef.current);
      setFogImage({ image: canvasRef.current });
      setFogAt(snap.id);
    });
    return () => cancelAnimationFrame(raf);
  }, [fog, snap.id]);

  // Open on what the character has explored by its latest save (with some margin).
  const fitTo = useMemo(() => {
    if (!fog) return null;
    const last = fog.snapshotId;
    fog.seek(snaps[snaps.length - 1].id);
    const b = fog.bounds();
    if (last >= 0) fog.seek(last);
    if (!b) return null;
    const pad = 600;
    const [x0, y0] = worldToUnit(b.x0 - pad, b.z1 + pad), [x1, y1] = worldToUnit(b.x1 + pad, b.z0 - pad);
    return { x0, y0, x1, y1 };
  }, [fog, snaps]);

  const poiFilter = useMemo(
    () => (spoilers || !fog || fogAt < 0 ? null : (p: PoiMarker) => fog.isExploredAt(p.x, p.z)),
    [spoilers, fog, fogAt]);

  // Path in this world up to the selected save: logout points where the game
  // recorded one, else the middle of what that save newly explored.
  const path = useMemo(() => {
    const pts: { x: number; z: number; logout: boolean; id: number }[] = [];
    if (!fog) return pts;
    let lastLogout = '';
    for (const s of snaps) {
      if (s.id > snap.id) break;
      if (s.worldId !== world.id) continue;
      const key = s.x != null && s.z != null ? `${s.x},${s.z}` : '';
      if (key && key !== lastLogout) {
        pts.push({ x: s.x!, z: s.z!, logout: true, id: s.id });
        lastLogout = key;
        continue;
      }
      const g = fog.growth.get(s.id);
      if (g && pts.length > 0) pts.push({ x: g.x, z: g.z, logout: false, id: s.id });
    }
    return pts;
  }, [snaps, snap.id, world.id, fog]);

  const pins = useMemo(() => at.data?.pins ?? [], [at.data]);
  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, v: MapView) => {
    const px = (x: number, z: number): [number, number] => {
      const [ux, uy] = worldToUnit(x, z);
      return [v.panX + ux * v.size, v.panY + uy * v.size];
    };
    // Path
    if (path.length > 1) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      path.forEach((p, i) => { const [x, y] = px(p.x, p.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = PATH_COLOR;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of path) {
      const [x, y] = px(p.x, p.z);
      ctx.beginPath();
      ctx.arc(x, y, p.logout ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.logout ? PATH_COLOR : 'rgba(255,179,71,0.7)';
      ctx.fill();
    }
    // Pins
    const big = v.scale > 1.2;
    const r = Math.max(5, Math.min(10, 4 * v.scale));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pin of pins) {
      const [x, y] = px(pin.pos.x, pin.pos.z);
      if (x < -40 || y < -40 || x > v.width + 40 || y > v.height + 40) continue;
      ctx.globalAlpha = pin.checked ? 0.45 : 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,24,32,0.8)';
      ctx.fill();
      ctx.strokeStyle = pin.type === 4 ? '#f87171' : '#e6edf3';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `${Math.round(r * 1.2)}px system-ui, "Segoe UI Emoji", sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(PIN_GLYPH[pin.typeName] ?? '📍', x, y + 1);
      const label = pin.name.startsWith('$') ? '' : pin.name;
      if (label && big) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, x, y + r + 10);
        ctx.fillText(label, x, y + r + 10);
      }
    }
    ctx.restore();
    // Where the player is at this save
    const here = path[path.length - 1];
    if (here && snap.worldId === world.id) {
      const [x, y] = px(here.x, here.z);
      ctx.save();
      ctx.shadowColor = PATH_COLOR;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = PATH_COLOR;
      ctx.stroke();
      ctx.restore();
    }
  }, [path, pins, snap.worldId, world.id]);

  function toggleSpoilers() {
    if (!spoilers) {
      const yours = world.viewerPlays
        ? char.isMine ? 'This is your world.' : 'You have a character in this world too.'
        : null;
      if (yours && !window.confirm(`${yours} Spoilers show the whole map and every location, explored or not. Show them?`)) return;
    }
    setSpoilers(s => !s);
  }

  const seed = world.seed;
  const map = useMemo(() => seed ? {
    baseUrl: `/api/worlds/${encodeURIComponent(seed)}`,
    forestUrl: `/api/track/map/${encodeURIComponent(seed)}/forest`,
  } : null, [seed]);
  const ready = status.data?.status === 'done' && map && fog;

  const worldSnaps = snaps.filter(s => s.worldId === world.id);
  const explored = at.data?.explored ?? null;

  return (
    <div className="ct-view">
      {ready ? (
        <WorldMap seed={seed!} baseUrl={map.baseUrl} forestUrl={map.forestUrl} className="ct-map"
          fog={spoilers ? null : fogImage} poiFilter={poiFilter} drawOverlay={drawOverlay} fitTo={fitTo}
          overlayVersion={drawOverlay} />
      ) : (
        <div className="ct-pending">
          <MapPending world={world} status={status.data} error={status.error?.message ?? tiles.error?.message}
            canName={char.isMine} />
        </div>
      )}

      <div className={`ct-panel${expanded ? ' expanded' : ''}`}>
        <div className="ct-who">
          {char.owner.avatarUrl && <img src={char.owner.avatarUrl} alt="" />}
          <div className="ct-who-text">
            <div className="ct-name">{char.name}</div>
            <div className="ct-owner">by <Link to={`/players/${char.owner.id}`}>{char.owner.username}</Link></div>
          </div>
          <button className="ct-expand" onClick={toggleExpanded} aria-expanded={expanded}
            title={expanded ? 'Less' : 'Inventory and details'}>{expanded ? '▴' : '▾'}</button>
        </div>
        <select className="ct-world" value={world.id} onChange={e => onWorld(Number(e.target.value))} aria-label="World">
          {char.worlds.map(w => <option key={w.id} value={w.id}>{w.name ?? `World ${w.uid}`}</option>)}
        </select>
        <div className="ct-line">
          {seed ? <>seed <strong>{seed}</strong></> : 'seed unknown'} · {formatPlay(snap.axis)}
        </div>
        {player.isError && !player.data && <p className="ct-line">Inventory unavailable for this save.</p>}
        {player.data && (expanded ? (
          <>
            <Bars l={player.data} />
            <Foods l={player.data} items={items} />
            <Inventory l={player.data} items={items} />
          </>
        ) : (
          <div className="ct-compact">
            <Foods l={player.data} items={items} />
            <Equipped l={player.data} items={items} />
          </div>
        ))}
        {expanded && (
          <dl className="ct-facts">
            <dt>Save</dt><dd>{new Date(snap.fileTime).toLocaleString()}</dd>
            <dt>Played</dt><dd>{formatPlay(snap.axis)} · session {snap.session}</dd>
            {explored != null && <><dt>Explored</dt><dd>{exploredKm2(explored)!.toFixed(1)} km² ({pctOfWorld(exploredKm2(explored)!)})</dd></>}
            <dt>Saves here</dt><dd>{worldSnaps.length} of {snaps.length}</dd>
          </dl>
        )}
        {snap.worldId !== world.id && snap.worldId != null && (
          <p className="ct-note">At this save {char.name} was in another world.</p>
        )}
        {snap.rewind && <p className="ct-note">This save was restored from a backup (play time went back).</p>}
        <button className={`ct-spoiler${spoilers ? ' on' : ''}`} onClick={toggleSpoilers} disabled={!ready}>
          {spoilers ? 'Hide unexplored' : 'Show spoilers'}
        </button>
      </div>

      <div className="ct-timeline">
        <CharTimeline snapshots={snaps} index={index} onChange={setIndex} worldId={world.id} />
      </div>
    </div>
  );
}

function MapPending({ world, status, error, canName }: {
  world: CharWorld; status?: MapStatus; error?: string; canName: boolean;
}) {
  if (error) return <div className="worlds-pending-msg error">{error}</div>;
  if (!status) return <div className="worlds-pending-msg">Loading…</div>;
  switch (status.status) {
    case 'noSeed':
      return canName ? <NameSeed world={world} />
        : <div className="worlds-pending-msg">This world&apos;s seed isn&apos;t known yet, so there&apos;s no map to show.</div>;
    case 'notQueued':
      return <div className="worlds-pending-msg">The map for {status.seed} will be made soon (there&apos;s a daily limit on new maps).</div>;
    case 'queued':
      return <div className="worlds-pending-msg">Map queued{status.estWait ? ` (~${status.estWait})` : '…'}</div>;
    case 'processing':
      return <div className="worlds-pending-msg">Generating the map… (about 80 seconds)</div>;
    case 'error':
      return <div className="worlds-pending-msg error">{status.error ?? 'The map could not be made'}</div>;
    default:
      return <div className="worlds-pending-msg">The map isn&apos;t available right now.</div>;
  }
}

/** The world's seed couldn't be worked out from the saves (a server world): ask its player. */
function NameSeed({ world }: { world: CharWorld }) {
  const qc = useQueryClient();
  const [seed, setSeed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/char/worlds/${world.id}/seed`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seed.trim() }),
      });
      if (!r.ok) { setError((await r.text()).replace(/^"|"$/g, '') || `HTTP ${r.status}`); return; }
      qc.invalidateQueries({ queryKey: ['char'] });
      qc.invalidateQueries({ queryKey: ['char-map', world.id] });
    } finally { setBusy(false); }
  }
  return (
    <form className="worlds-pending-msg ct-seed-form" onSubmit={submit}>
      <div className="ct-seed-title">What&apos;s the seed of {world.name ?? 'this world'}?</div>
      <p>It&apos;s a server world, so its seed isn&apos;t in your saves. Whoever runs the server can tell you.</p>
      <div className="ct-seed-row">
        <input value={seed} onChange={e => setSeed(e.target.value)} placeholder="Seed" maxLength={64} autoFocus />
        <button disabled={busy || !seed.trim()}>Save</button>
      </div>
      {error && <p className="ct-error">{error}</p>}
    </form>
  );
}
