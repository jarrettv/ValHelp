import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import {
  BOSSES, CORRIDOR_EDGE_DISTANCE, TRADERS, bossOffsets, corridorHalfWidth, inCorridor, polarWobble, seedName, seedSpace,
  traderPairs, type Altar, type Corridor,
} from './worldgen/seedFinder';
import { SeedScanner, type Candidate, type ScanProgress, type ScanStats } from './worldgen/seedScanner';
import './SeedFinder.css';

// Seed finder (/seeds, anyone): scans a prefix's seeds (fun0000000 … funZZZZZZZ) in Web
// Workers running seedgen's worldgen as WebAssembly, for worlds whose bosses all
// sit near a north-south line through spawn.
//   Pass 1, bosses: a quick biome screen, then the game's exact boss placement
//   (seedgen's BossScan); every boss needs an altar inside the corridor.
//   Pass 2, traders: of those, Haldor near an Elder altar and the Bog Witch near
//   a Bonemass altar (inside the corridor). The exact placement gives their camps
//   too, so this pass is a filter on the candidates, changed live.
// Settings, each prefix's progress and the candidates stay in this browser.
// Map links open the world generated in this browser (?local=1); the site owner's
// open it on the server (seedgen).
// Build the WebAssembly first: scripts/build_worldgen_wasm.sh.

const STORAGE_KEY = 'valhelp.seedFinder.v1';

interface Saved {
  prefix: string;
  workers: number;
  corridor: Corridor;
  /** Percent of screened seeds set aside before the exact pass. */
  screenOut: number;
  /** Pass 2: how close (m) each trader's camp must be to its boss's altar. */
  traderRange: number;
  /** Show only candidates through pass 2. */
  tradersOnly: boolean;
  progress: Record<string, ScanProgress>;
  candidates: Candidate[];
}

const defaultWorkers = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const DEFAULT_CORRIDOR: Corridor = { center: 1000, edge: 3000, polar: 2000 };

function load(): Saved {
  const fallback: Saved = {
    prefix: 'fun', workers: defaultWorkers(), corridor: DEFAULT_CORRIDOR, screenOut: 30,
    traderRange: 1500, tradersOnly: false, progress: {}, candidates: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const s = { ...fallback, ...JSON.parse(raw) } as Saved;
    return { ...s, corridor: { ...DEFAULT_CORRIDOR, ...s.corridor } };   // saved before the polar width
  } catch { return fallback; }
}

function save(s: Saved) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable: this session only */ }
}

const fmt = (n: number) => n.toLocaleString();
const rate = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(2));
const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
function duration(ms: number) {
  const s = Math.floor(ms / 1000);
  return s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Candidates found before the trader pass existed have no trader camps (they're rechecked on Start). */
const hasTraders = (c: Candidate) => c.altars.some(([p]) => p === TRADERS[0].prefab);

/** How a candidate looks under the settings now: both passes, its worst boss's offset from the axis (0-1),
 *  and each trader's closest pair. */
function judge(c: Corridor, range: number, cand: Candidate) {
  const offsets = bossOffsets(c, cand.altars);
  const passes = offsets.every(o => o !== null);
  const worst = passes ? Math.max(...(offsets as number[])) : 1;
  const worstBoss = BOSSES[offsets.indexOf(passes ? worst : null)];
  const pairs = traderPairs(c, cand.altars);
  const traders = hasTraders(cand) ? passes && pairs.every(p => p !== null && p.distance <= range) : null;
  return { passes, worst, worstBoss, pairs, traders };
}

export default function SeedFinder() {
  const { status } = useAuth();
  const isOwner = status?.id === 1;
  const [saved, setSaved] = useState<Saved>(load);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const scanner = useRef<SeedScanner | null>(null);
  const savedRef = useRef(saved);

  const update = (f: (s: Saved) => Saved) => setSaved(prev => {
    const next = f(prev);
    savedRef.current = next;
    save(next);
    return next;
  });

  useEffect(() => () => { scanner.current?.stop(); }, []);

  const { prefix, corridor, workers, screenOut, traderRange, tradersOnly } = saved;
  const prefixOk = /^[A-Za-z0-9]{1,6}$/.test(prefix);
  const progress = saved.progress[prefix] ?? { next: 0, queue: [] };
  const space = prefixOk ? seedSpace(prefix) : 0;

  function start() {
    if (running || !prefixOk) return;
    setError(null);
    const s = savedRef.current;
    // Saved candidates without trader camps go first, for the trader pass.
    const base = s.progress[s.prefix] ?? { next: 0, queue: [] };
    const recheck = s.candidates.filter(c => !hasTraders(c) && !base.queue.some(q => q.name === c.name))
      .map(c => ({ name: c.name, chance: c.chance }));
    const sc = new SeedScanner(
      { prefix: s.prefix, corridor: s.corridor, screenOut: s.screenOut / 100, workers: s.workers },
      { next: base.next, queue: [...recheck, ...base.queue] },
      {
        candidate: c => update(prev => ({ ...prev, candidates: [c, ...prev.candidates.filter(x => x.name !== c.name)] })),
        // A rechecked candidate that no longer passes keeps its place, with the fresh camps and altars.
        rejected: (name, altars) => update(prev => prev.candidates.some(x => x.name === name)
          ? { ...prev, candidates: prev.candidates.map(x => (x.name === name ? { ...x, altars } : x)) }
          : prev),
        stats: st => {
          setStats(st);
          const p = sc.progress();
          update(prev => ({ ...prev, progress: { ...prev.progress, [s.prefix]: p } }));
        },
        error: message => { setError(message); setRunning(false); scanner.current = null; },
        done: () => { setRunning(false); scanner.current = null; },
      },
    );
    scanner.current = sc;
    setRunning(true);
    sc.start();
  }

  function stop() {
    const sc = scanner.current;
    if (!sc) return;
    const p = sc.stop();
    scanner.current = null;
    setRunning(false);
    update(prev => ({ ...prev, progress: { ...prev.progress, [prev.prefix]: p } }));
  }

  function restart() {
    if (!confirm(`Start ${prefix} over from ${seedName(prefix, 0)}?`)) return;
    update(prev => {
      const rest = { ...prev.progress };
      delete rest[prev.prefix];
      return { ...prev, progress: rest };
    });
    setStats(null);
  }

  const judged = useMemo(() => saved.candidates
    .map(c => ({ c, ...judge(corridor, traderRange, c) }))
    .sort((a, b) => Number(b.passes) - Number(a.passes) || Number(b.traders === true) - Number(a.traders === true)
      || a.worst - b.worst || b.c.found - a.c.found),
  [saved.candidates, corridor, traderRange]);
  const traderCount = judged.filter(j => j.traders).length;
  const shownRows = tradersOnly ? judged.filter(j => j.traders) : judged;

  const shown = judged.find(j => j.c.name === (hovered ?? selected));

  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const setCorridor = (k: keyof Corridor, v: string, max: number) =>
    update(s => ({ ...s, corridor: { ...s.corridor, [k]: num(v, 100, max) } }));
  const st = stats;

  return (
    <div className="asf-page">
      <h1>Seed finder</h1>
      <p className="asf-sub">
        Scans seeds in this browser for worlds where every boss has an altar near a north-south line through spawn
        (pass 1), then looks for Haldor near the Elder and the Bog Witch near Bonemass (pass 2). Each seed gets a
        quick biome screen (tens of ms) that sets aside the least likely seeds, and the rest get the game&apos;s
        exact placement (~10 s per seed per worker). Candidates, settings and each prefix&apos;s progress are saved
        in this browser.
      </p>

      <div className="asf-layout">
        <div className="asf-main">
          <section className="asf-panel">
            <form className="asf-controls" onSubmit={e => { e.preventDefault(); if (running) stop(); else start(); }}>
              <label>Prefix
                <input value={prefix} maxLength={6} disabled={running} spellCheck={false}
                       onChange={e => update(s => ({ ...s, prefix: e.target.value.trim() }))} />
              </label>
              <label>Workers
                <input type="number" min={1} max={navigator.hardwareConcurrency || 16} value={workers} disabled={running}
                       onChange={e => update(s => ({ ...s, workers: num(e.target.value, 1, navigator.hardwareConcurrency || 16) }))} />
              </label>
              <label title="Screened seeds with the lowest estimated chance skip the exact check. 0 checks every seed exactly.">
                Screen out lowest (%)
                <input type="number" min={0} max={90} step={5} value={screenOut} disabled={running}
                       onChange={e => update(s => ({ ...s, screenOut: num(e.target.value, 0, 90) }))} />
              </label>
              <label>Half-width at spawn (m)
                <input type="number" min={100} max={5000} step={100} value={corridor.center} disabled={running}
                       onChange={e => setCorridor('center', e.target.value, 5000)} />
              </label>
              <label>Half-width at 10 km (m)
                <input type="number" min={100} max={8000} step={100} value={corridor.edge} disabled={running}
                       onChange={e => setCorridor('edge', e.target.value, 8000)} />
              </label>
              <label title="The corridor's half-width inside the Deep North and the Ash Lands (Fimbulbringer and Fader).">
                Half-width in the poles (m)
                <input type="number" min={100} max={8000} step={100} value={corridor.polar} disabled={running}
                       onChange={e => setCorridor('polar', e.target.value, 8000)} />
              </label>
              <label title="Pass 2: Haldor within this distance of an Elder altar, the Bog Witch of a Bonemass altar (both inside the corridor). Applies to the list at once.">
                Trader within (m)
                <input type="number" min={100} max={10000} step={100} value={traderRange}
                       onChange={e => update(s => ({ ...s, traderRange: num(e.target.value, 100, 10000) }))} />
              </label>
              <div className="asf-buttons">
                <button type="submit" disabled={!prefixOk} className={running ? 'asf-stop' : 'asf-start'}>{running ? 'Stop' : 'Start'}</button>
                <button type="button" onClick={restart} disabled={running || !saved.progress[prefix]}>Restart prefix</button>
              </div>
            </form>
            {!prefixOk && <div className="asf-error">The prefix is 1 to 6 letters or digits.</div>}
            {prefixOk && (
              <div className="asf-position">
                {running ? 'Screening at' : progress.next > 0 ? 'Resumes at' : 'Starts at'}{' '}
                <code>{seedName(prefix, Math.min(st?.next ?? progress.next, space - 1))}</code>
                <span className="asf-muted"> of {seedName(prefix, 0)} … {seedName(prefix, space - 1)}
                  {progress.queue.length > 0 && !running && ` · ${progress.queue.length} queued for the exact check`}</span>
              </div>
            )}
            {error && <div className="asf-error">{error}</div>}

            <div className="asf-stats" aria-live="polite">
              <Stat label="Checked" value={st ? fmt(st.screenRejected + st.exactDone) : '–'} hint={st ? `${fmt(st.screened)} screened` : undefined} />
              <Stat label="Candidates" value={st ? fmt(st.candidates) : '–'} accent hint={`${fmt(traderCount)} saved with traders`} />
              <Stat label="Screened out" value={st ? fmt(st.screenRejected) : '–'} />
              <Stat label="Rejected (exact)" value={st ? fmt(st.exactRejected) : '–'} />
              <Stat label="Seeds / s" value={st ? rate(st.rate) : '–'} hint={st ? `exact ${rate(st.exactRate)}/s` : undefined} />
              <Stat label="Per seed" value={st?.exactMs ? `${(st.exactMs / 1000).toFixed(1)} s` : '–'} hint={st?.screenMs ? `screen ${st.screenMs.toFixed(0)} ms` : undefined} />
              <Stat label="Exact running" value={st ? `${st.exactRunning}` : '–'} hint={st ? `${st.queued} queued` : undefined} />
              <Stat label="Elapsed" value={st ? duration(st.elapsedMs) : '–'} />
            </div>

            {st && st.exactRejected > 0 && (
              <div className="asf-missing">
                <h2>Why exact checks failed</h2>
                <p className="asf-muted">Share of rejected seeds with no altar of each boss in the corridor.</p>
                {BOSSES.map((b, i) => {
                  const f = st.missing[i] / st.exactRejected;
                  return (
                    <div key={b.prefab} className="asf-bar">
                      <span>{b.label}</span>
                      <span className="asf-bar-track"><span style={{ width: `${f * 100}%`, background: b.color }} /></span>
                      <span className="asf-num">{Math.round(f * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="asf-panel">
            <div className="asf-cand-head">
              <h2>Candidates <span className="asf-muted">({saved.candidates.length}, {traderCount} with traders)</span></h2>
              <label className="asf-check">
                <input type="checkbox" checked={tradersOnly} onChange={e => update(s => ({ ...s, tradersOnly: e.target.checked }))} />
                Traders nearby only
              </label>
              {saved.candidates.length > 0 && (
                <button type="button" onClick={() => { if (confirm('Clear every candidate?')) update(s => ({ ...s, candidates: [] })); }}>Clear</button>
              )}
            </div>
            {shownRows.length === 0
              ? <p className="asf-muted">{tradersOnly && judged.length ? 'None with both traders nearby yet.' : 'None yet.'}</p>
              : (
                <div className="asf-table-wrap">
                  <table className="asf-table">
                    <thead>
                      <tr>
                        <th>Seed</th>
                        <th title="How far the least central boss is off the axis, as a share of the corridor's half-width there">Worst boss</th>
                        {TRADERS.map(t => <th key={t.prefab} title={`Closest ${t.label} camp to an altar of ${BOSSES.find(b => b.prefab === t.boss)!.label} inside the corridor`}>{t.label}</th>)}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map(({ c, passes, worst, worstBoss, pairs, traders }) => (
                        <tr key={c.name} className={`${c.name === selected ? 'sel' : ''} ${passes ? '' : 'asf-dim'}`}
                            onClick={() => setSelected(c.name === selected ? null : c.name)}
                            onMouseEnter={() => setHovered(c.name)} onMouseLeave={() => setHovered(null)}>
                          <td><code>{c.name}</code>{traders && <span className="asf-badge" title="Through pass 2: both traders nearby">2</span>}</td>
                          <td>{passes ? <>{worstBoss.label} <span className="asf-muted">{Math.round(worst * 100)}%</span></> : <span className="asf-muted">outside the corridor now</span>}</td>
                          {TRADERS.map((t, i) => {
                            const p = pairs[i];
                            return (
                              <td key={t.prefab} className="asf-num">
                                {!hasTraders(c) ? <span className="asf-muted" title="Found before the trader pass: rechecked on the next Start">?</span>
                                  : p ? <span className={p.distance <= traderRange ? 'asf-near' : 'asf-muted'}>{km(p.distance)}</span>
                                  : <span className="asf-muted">–</span>}
                              </td>
                            );
                          })}
                          <td className="asf-actions">
                            <a href={`/worlds/${encodeURIComponent(c.name)}${isOwner ? '' : '?local=1'}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Map</a>
                            <button type="button" aria-label={`Copy ${c.name}`} onClick={e => { e.stopPropagation(); void navigator.clipboard?.writeText(c.name); }}>Copy</button>
                            <button type="button" aria-label={`Remove ${c.name}`} onClick={e => { e.stopPropagation(); update(s => ({ ...s, candidates: s.candidates.filter(x => x.name !== c.name) })); }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </div>

        <aside className="asf-panel asf-side">
          <CorridorDiagram corridor={corridor} altars={shown?.c.altars} pairs={shown?.pairs} range={traderRange} />
          <div className="asf-legend">
            {BOSSES.map(b => <span key={b.prefab}><i style={{ background: b.color }} />{b.label}</span>)}
            {TRADERS.map((t, i) => <span key={t.prefab}><i className={i ? 'diamond' : 'square'} style={{ background: t.color }} />{t.label}</span>)}
          </div>
          <p className="asf-muted asf-caption">
            {shown
              ? <>Altars of <strong>{shown.c.name}</strong>: filled inside the corridor, hollow outside. Lines join each trader to its boss (solid within {km(traderRange)}).</>
              : <>The band is the search area: every boss needs an altar inside it, narrower in the Deep North and Ash Lands. Hover or select a candidate to see its altars.</>}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`asf-stat ${accent ? 'accent' : ''}`}>
      <div className="asf-stat-label">{label}</div>
      <div className="asf-stat-value">{value}</div>
      {hint && <div className="asf-stat-hint">{hint}</div>}
    </div>
  );
}

// ── The diagram: the world disc, north up, with the corridor ─────────────────

const R = 10500;   // the world's edge

/** The edge of a polar region: |(x, z - cz)| = 12000 + wobble, as an SVG path (y = -z). */
function polarEdge(cz: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    let r = 12000;
    for (let k = 0; k < 4; k++) r = 12000 + polarWobble(r * Math.sin(a), cz + r * Math.cos(a));
    pts.push(`${(r * Math.sin(a)).toFixed(0)},${(-(cz + r * Math.cos(a))).toFixed(0)}`);
  }
  return `M${pts.join('L')}Z`;
}
const BOX = `M${-R - 500},${-R - 500}H${R + 500}V${R + 500}H${-R - 500}Z`;
const DN_EDGE = polarEdge(-4000);
const ASH_EDGE = polarEdge(4000);
const DEEP_NORTH = BOX + DN_EDGE;   // evenodd: outside the edge
const ASH_LANDS = BOX + ASH_EDGE;

function CorridorDiagram({ corridor, altars, pairs, range }: {
  corridor: Corridor; altars?: Altar[]; pairs?: ReturnType<typeof traderPairs>; range: number;
}) {
  const e = corridorHalfWidth(corridor, CORRIDOR_EDGE_DISTANCE);
  const band = `M${corridor.center},0L${e},${-CORRIDOR_EDGE_DISTANCE}L${e},${-R}L${-e},${-R}L${-e},${-CORRIDOR_EDGE_DISTANCE}` +
    `L${-corridor.center},0L${-e},${CORRIDOR_EDGE_DISTANCE}L${-e},${R}L${e},${R}L${e},${CORRIDOR_EDGE_DISTANCE}Z`;
  const color = new Map<string, string>([...BOSSES, ...TRADERS].map(b => [b.prefab, b.color]));
  const trader = new Map<string, number>(TRADERS.map((t, i) => [t.prefab, i]));
  const p = corridor.polar;
  return (
    <svg className="asf-diagram" viewBox={`${-R - 700} ${-R - 700} ${2 * R + 1400} ${2 * R + 1400}`} role="img"
         aria-label={`World map, north up: the search band is ${corridor.center} m either side of the north-south axis at spawn, ` +
           `${corridor.edge} m at 10 km, ${corridor.polar} m in the Deep North and Ash Lands`}>
      <defs>
        <clipPath id="asf-world"><circle r={R} /></clipPath>
        <clipPath id="asf-not-dn"><path d={DN_EDGE} /></clipPath>
        <clipPath id="asf-not-ash"><path d={ASH_EDGE} /></clipPath>
        <clipPath id="asf-polar"><path d={DEEP_NORTH} clipRule="evenodd" /><path d={ASH_LANDS} clipRule="evenodd" /></clipPath>
      </defs>
      <circle r={R} className="asf-d-world" />
      <g clipPath="url(#asf-world)">
        <path d={DEEP_NORTH} className="asf-d-dn" fillRule="evenodd" />
        <path d={ASH_LANDS} className="asf-d-ash" fillRule="evenodd" />
        <g clipPath="url(#asf-not-dn)"><g clipPath="url(#asf-not-ash)"><path d={band} className="asf-d-band" /></g></g>
        <g clipPath="url(#asf-polar)"><rect x={-p} y={-R} width={2 * p} height={2 * R} className="asf-d-band" /></g>
        {[2500, 5000, 7500].map(r => <circle key={r} r={r} className="asf-d-ring" />)}
        <line x1={0} y1={-R} x2={0} y2={R} className="asf-d-axis" />
      </g>
      <circle r={R} className="asf-d-edge" />
      <text x={0} y={-R - 160} className="asf-d-label">N</text>
      <text x={0} y={R + 560} className="asf-d-label">S</text>
      <text x={5000 * Math.SQRT1_2 + 120} y={-5000 * Math.SQRT1_2 - 120} className="asf-d-small">5 km</text>
      <text x={0} y={-8900} className="asf-d-small asf-d-region">Deep North</text>
      <text x={0} y={9500} className="asf-d-small asf-d-region">Ash Lands</text>
      {pairs?.map((pair, i) => pair && (
        <line key={i} x1={pair.boss[0]} y1={-pair.boss[1]} x2={pair.trader[0]} y2={-pair.trader[1]}
              className={pair.distance <= range ? 'asf-d-pair' : 'asf-d-pair far'} style={{ stroke: TRADERS[i].color }} />
      ))}
      {altars?.map(([prefab, x, z], i) => {
        const t = trader.get(prefab);
        if (t !== undefined) {
          const s = 170;
          return <rect key={i} x={x - s} y={-z - s} width={2 * s} height={2 * s} className="asf-d-trader"
                       transform={t ? `rotate(45 ${x} ${-z})` : undefined} style={{ fill: color.get(prefab) }} />;
        }
        const inside = inCorridor(corridor, x, z);
        return <circle key={i} cx={x} cy={-z} r={inside ? 230 : 190} className={inside ? 'asf-d-altar' : 'asf-d-altar out'}
                       style={{ fill: inside ? color.get(prefab) : 'none', stroke: color.get(prefab) }} />;
      })}
      <circle r={170} className="asf-d-spawn" />
    </svg>
  );
}
