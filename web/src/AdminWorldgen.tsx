import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import WorldMap from './components/WorldMap';
import PoiCard from './components/PoiCard';
import type { PoiMarker } from './components/poiIcons';
import { STAGE_LABELS, type WorldgenMessage, type WorldgenStage } from './worldgen/worldgenTypes';
import './AdminWorldgen.css';

// Admin dev page: generate a seed's map in this browser (seedgen's worldgen
// compiled to WebAssembly, in a Web Worker) and show it on the normal map view.
// Terrain, location placement and each location's contents (no oracle loot:
// exact chest items still come from the server). Build the WebAssembly first:
// scripts/build_worldgen_wasm.sh.
// See BROWSER_WORLDGEN.md.

const STAGES: WorldgenStage[] = ['runtime', 'generator', 'textures', 'vectors', 'mask', 'locations', 'contents'];


interface Result {
  seed: string;
  seedHash: number;
  bvec: ArrayBuffer;
  timings: Partial<Record<WorldgenStage, number>>;
  urls: { biomes: string; mask: string; pois: string };
  pois: PoiMarker[];
  rulesVersion: string;
}

type Compare = { state: 'idle' } | { state: 'busy' } | { state: 'done'; text: string; ok: boolean };

const secs = (ms: number | undefined) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);

export default function AdminWorldgen() {
  const { status } = useAuth();
  const [seedInput, setSeedInput] = useState('JVModsFun');
  const [running, setRunning] = useState<{ stage: WorldgenStage; fraction: number; detail?: string; started: number } | null>(null);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<Compare>({ state: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  // POI cards, as on the Worlds page: one under the cursor, one pinned by a click.
  type PoiAt = { poi: PoiMarker; x: number; y: number };
  const [hoverPoi, setHoverPoi] = useState<PoiAt | null>(null);
  const [pinnedPoi, setPinnedPoi] = useState<PoiAt | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // One worker per page: the runtime loads once and is reused for every seed.
  useEffect(() => () => workerRef.current?.terminate(), []);
  // Release the previous map's blob URLs.
  useEffect(() => () => { if (result) Object.values(result.urls).forEach(URL.revokeObjectURL); }, [result]);
  // Tick the elapsed time while running.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  function generate() {
    const seed = seedInput.trim();
    if (!seed || running) return;
    setError(null);
    setCompare({ state: 'idle' });
    setHoverPoi(null);
    setPinnedPoi(null);
    const started = performance.now();
    setRunning({ stage: 'runtime', fraction: 0, started });
    setNow(started);

    workerRef.current ??= new Worker(new URL('./worldgen/worldgenWorker.ts', import.meta.url), { type: 'module' });
    const worker = workerRef.current;
    worker.onmessage = (e: MessageEvent<WorldgenMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setRunning({ stage: m.stage, fraction: m.fraction, detail: m.detail, started });
      else if (m.type === 'error') { setRunning(null); setError(m.message); }
      else {
        setRunning(null);
        setResult({
          seed: m.seed, seedHash: m.seedHash, bvec: m.bvec, timings: m.timings, pois: m.pois, rulesVersion: m.rulesVersion,
          urls: {
            biomes: URL.createObjectURL(new Blob([m.bvec])),
            mask: URL.createObjectURL(m.mask),
            pois: URL.createObjectURL(new Blob([JSON.stringify(m.pois)], { type: 'application/json' })),
          },
        });
      }
    };
    worker.onerror = e => { setRunning(null); setError(e.message || 'Worker failed (is /worldgen/ built? scripts/build_worldgen_wasm.sh)'); };
    worker.postMessage({ type: 'generate', seed });
  }

  /** The server's vector map (byte for byte) and locations (prefab and position) for the same seed. */
  async function compareWithServer() {
    if (!result) return;
    setCompare({ state: 'busy' });
    try {
      const base = `/api/worlds/${encodeURIComponent(result.seed)}`;
      const [r, rp] = await Promise.all([fetch(`${base}/biomes`), fetch(`${base}/pois`)]);
      if (!r.ok || !rp.ok) throw new Error(r.status === 404 ? 'the server has no map for this seed yet (open it on the Worlds page)' : `HTTP ${r.status}/${rp.status}`);
      const server = new Uint8Array(await r.arrayBuffer());
      const ours = new Uint8Array(result.bvec);
      let first = -1;
      for (let i = 0; i < Math.min(server.length, ours.length); i++) if (server[i] !== ours[i]) { first = i; break; }
      const same = first < 0 && server.length === ours.length;

      // POIs: the server's locations are the game's own (from its saved world); match on prefab and
      // position, then compare what each holds (contents and vegvisirs, as the card shows them).
      const key = (p: PoiMarker) => `${p.prefab}@${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      const canon = (o: Record<string, number> | undefined | null) =>
        o ? JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])) : '';
      const serverPois: PoiMarker[] = await rp.json();
      const byKey = new Map(serverPois.map(p => [key(p), p]));
      let common = 0, sameContents = 0;
      for (const p of result.pois) {
        const sp = byKey.get(key(p));
        if (!sp) continue;
        common++;
        if (canon(p.contents) === canon(sp.contents) && JSON.stringify(p.vegvisirs ?? null) === JSON.stringify(sp.vegvisirs ?? null)) sameContents++;
      }
      const locOk = common === result.pois.length && common === serverPois.length && sameContents === common;

      setCompare({
        state: 'done', ok: same && locOk,
        text: (same
          ? `Vector map identical to the server's (${ours.length.toLocaleString()} bytes). `
          : `Vector map differs from the server's: ${ours.length.toLocaleString()} vs ${server.length.toLocaleString()} bytes` +
            (first >= 0 ? `, first difference at byte ${first.toLocaleString()}` : '') +
            ' (the server map may predate the latest worldgen fixes: redeploy seedgen and regenerate). ') +
          `POIs: ${common.toLocaleString()} of ours (${result.pois.length.toLocaleString()}) match the server's ` +
          `(${serverPois.length.toLocaleString()}); ${sameContents.toLocaleString()} of those hold the same contents.`,
      });
    } catch (e) {
      setCompare({ state: 'done', ok: false, text: `Couldn't compare: ${e instanceof Error ? e.message : e}` });
    }
  }

  const assets = useMemo(() => result && { biomes: result.urls.biomes, mask: result.urls.mask, altBiomes: false }, [result]);

  if (status?.id !== 1) return <div style={{ padding: '1rem' }}>Admin access required.</div>;

  const total = result ? Object.values(result.timings).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <div className="awg-page">
      <h1>Worldgen in the browser</h1>
      <p className="awg-sub">
        Builds a seed&apos;s map on this machine with seedgen&apos;s worldgen compiled to WebAssembly: terrain,
        location placement and each location&apos;s contents. Hover a POI for its card. Exact chest items still
        come only from the server (the game&apos;s own loot rolls).
      </p>

      <form className="awg-controls" onSubmit={e => { e.preventDefault(); generate(); }}>
        <input value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="Seed" maxLength={10}
               aria-label="Seed" disabled={!!running} />
        <button type="submit" disabled={!!running || !seedInput.trim()}>{running ? 'Generating…' : 'Generate'}</button>
        {result && !running && (
          <>
            <button type="button" onClick={compareWithServer} disabled={compare.state === 'busy'}>Compare with server</button>
            <a className="awg-link" href={result.urls.biomes} download={`${result.seed}.bvec`}>Download bvec</a>
          </>
        )}
      </form>

      {running && (
        <div className="awg-progress" role="status" aria-live="polite">
          <ol className="awg-stages">
            {STAGES.map(s => {
              const idx = STAGES.indexOf(s), cur = STAGES.indexOf(running.stage);
              const state = idx < cur ? 'done' : idx === cur ? 'active' : 'todo';
              return (
                <li key={s} className={`awg-stage ${state}`}>
                  {STAGE_LABELS[s]}
                  {state === 'active' && (s === 'textures' || s === 'locations' || s === 'contents') && <span className="awg-pct"> {Math.round(running.fraction * 100)}%</span>}
                  {state === 'active' && running.detail && <span className="awg-muted"> {running.detail}</span>}
                </li>
              );
            })}
          </ol>
          <div className="awg-elapsed">{secs(now - running.started)}</div>
        </div>
      )}

      {error && <div className="awg-error">{error}</div>}

      {result && !running && (
        <div className="awg-summary">
          <strong>{result.seed}</strong> <span className="awg-muted">(seed {result.seedHash})</span>
          {' · '}{STAGES.map(s => `${STAGE_LABELS[s]} ${secs(result.timings[s])}`).join(' · ')}
          {' · '}<strong>total {secs(total)}</strong>
          {' · '}{result.bvec.byteLength.toLocaleString()} bytes
          {' · '}{result.pois.length.toLocaleString()} POIs
          {' · '}<span className="awg-muted">rules from game {result.rulesVersion}</span>
          {compare.state === 'busy' && <div className="awg-muted">Comparing…</div>}
          {compare.state === 'done' && <div className={compare.ok ? 'awg-ok' : 'awg-warn'}>{compare.text}</div>}
        </div>
      )}

      {result && assets && (
        <div className="awg-map" ref={mapRef}>
          <WorldMap
            key={result.urls.biomes}
            seed={result.seed}
            baseUrl={`/api/worlds/${encodeURIComponent(result.seed)}`}
            forestUrl={`/api/track/map/${encodeURIComponent(result.seed)}/forest`}
            poisUrl={result.urls.pois}
            assets={assets}
            className="awg-worldmap"
            onPoiHover={setHoverPoi}
            onPoiClick={(poi, at) => setPinnedPoi(poi ? { poi, ...at } : null)}
          />
          {[pinnedPoi, hoverPoi && hoverPoi.poi !== pinnedPoi?.poi ? hoverPoi : null].map((at, i) => at && mapRef.current && (
            <PoiCard key={i ? 'hover' : 'pinned'} poi={at.poi} x={at.x} y={at.y}
              width={mapRef.current.clientWidth} height={mapRef.current.clientHeight}
              pinned={!i} onClose={() => setPinnedPoi(null)} />
          ))}
        </div>
      )}
    </div>
  );
}
