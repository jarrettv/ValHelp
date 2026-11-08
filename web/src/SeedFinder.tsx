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
// Each prefix is a session (its settings, progress, running totals and candidates),
// kept in this browser so prefixes can be switched between and resumed. Hearted
// candidates are kept by Clear and listed across sessions.
// Map links open the world generated in this browser (?local=1); the site owner's
// open it on the server (seedgen).
// Build the WebAssembly first: scripts/build_worldgen_wasm.sh.

const STORAGE_KEY = 'valhelp.seedFinder.v2';
/** Before sessions: one set of settings, progress per prefix, one candidate list. Read once, then left alone. */
const V1_KEY = 'valhelp.seedFinder.v1';

/** A session's search settings. */
interface Settings {
  corridor: Corridor;
  /** Percent of screened seeds set aside before the exact pass. */
  screenOut: number;
  /** Pass 2: how close (m) each trader's camp must be to its boss's altar. */
  traderRange: number;
}

/** A session's counts over every run. */
interface Totals {
  screened: number;
  screenRejected: number;
  exactDone: number;
  exactRejected: number;
  /** Per boss (BOSSES order): exact rejections with no altar of it in the corridor. */
  missing: number[];
  elapsedMs: number;
}

type SavedCandidate = Candidate & { /** When it was hearted. */ hearted?: number };

interface Session extends Settings {
  prefix: string;
  progress: ScanProgress;
  totals: Totals;
  candidates: SavedCandidate[];
  created: number;
  updated: number;
}

interface Saved {
  /** The prefix shown: a session's, or a new one (with `draft` settings) until it's started. */
  prefix: string;
  workers: number;
  /** Show only candidates through pass 2. */
  tradersOnly: boolean;
  /** Show only hearted candidates. */
  heartedOnly: boolean;
  draft: Settings;
  sessions: Record<string, Session>;
}

const defaultWorkers = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const DEFAULT_CORRIDOR: Corridor = { center: 1000, edge: 3000, polar: 2000 };
const DEFAULT_SETTINGS: Settings = { corridor: DEFAULT_CORRIDOR, screenOut: 30, traderRange: 1500 };
const noTotals = (): Totals => ({ screened: 0, screenRejected: 0, exactDone: 0, exactRejected: 0, missing: BOSSES.map(() => 0), elapsedMs: 0 });

const settingsOf = (s: Settings): Settings => ({ corridor: s.corridor, screenOut: s.screenOut, traderRange: s.traderRange });

function newSession(prefix: string, settings: Settings): Session {
  const now = Date.now();
  return { ...settingsOf(settings), prefix, progress: { next: 0, queue: [] }, totals: noTotals(), candidates: [], created: now, updated: now };
}

/** A session's totals with a run's counts added. */
function addRun(base: Totals, st: ScanStats): Totals {
  return {
    screened: base.screened + st.screened,
    screenRejected: base.screenRejected + st.screenRejected,
    exactDone: base.exactDone + st.exactDone,
    exactRejected: base.exactRejected + st.exactRejected,
    missing: BOSSES.map((_, i) => (base.missing[i] ?? 0) + st.missing[i]),
    elapsedMs: base.elapsedMs + st.elapsedMs,
  };
}

/** Sessions from the single-list format: each prefix with progress becomes one, and takes its candidates. */
function fromV1(raw: string, fallback: Saved): Saved {
  const v1 = JSON.parse(raw) as Partial<Settings & {
    prefix: string; workers: number; tradersOnly: boolean; progress: Record<string, ScanProgress>; candidates: Candidate[];
  }>;
  const settings: Settings = {
    corridor: { ...DEFAULT_CORRIDOR, ...v1.corridor },
    screenOut: v1.screenOut ?? DEFAULT_SETTINGS.screenOut,
    traderRange: v1.traderRange ?? DEFAULT_SETTINGS.traderRange,
  };
  const sessions: Record<string, Session> = {};
  const session = (p: string) => (sessions[p] ??= newSession(p, settings));
  for (const [p, progress] of Object.entries(v1.progress ?? {})) session(p).progress = progress;
  const prefixes = Object.keys(sessions).sort((a, b) => b.length - a.length);
  for (const c of v1.candidates ?? []) {
    const p = prefixes.find(x => c.name.startsWith(x))
      ?? (v1.prefix && c.name.startsWith(v1.prefix) ? v1.prefix : c.name.slice(0, 3));
    session(p).candidates.push(c);
  }
  return {
    ...fallback, prefix: v1.prefix ?? fallback.prefix, workers: v1.workers ?? fallback.workers,
    tradersOnly: v1.tradersOnly ?? false, draft: settings, sessions,
  };
}

function load(): Saved {
  const fallback: Saved = {
    prefix: 'fun', workers: defaultWorkers(), tradersOnly: false, heartedOnly: false, draft: DEFAULT_SETTINGS, sessions: {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) } as Saved;
    const v1 = localStorage.getItem(V1_KEY);
    return v1 ? fromV1(v1, fallback) : fallback;
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
function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : new Date(t).toLocaleDateString();
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
  /** Change a prefix's session, starting it if it's new. */
  const updateSession = (p: string, f: (s: Session) => Session) => update(prev => ({
    ...prev,
    sessions: { ...prev.sessions, [p]: { ...f(prev.sessions[p] ?? newSession(p, prev.draft)), updated: Date.now() } },
  }));

  useEffect(() => () => { scanner.current?.stop(); }, []);

  const { prefix, workers, tradersOnly, heartedOnly, sessions } = saved;
  const session = sessions[prefix];
  const { corridor, screenOut, traderRange } = session ?? saved.draft;
  const candidates = useMemo(() => session?.candidates ?? [], [session?.candidates]);
  const totals = session?.totals ?? noTotals();
  const prefixOk = /^[A-Za-z0-9]{1,6}$/.test(prefix);
  const progress = session?.progress ?? { next: 0, queue: [] };
  const space = prefixOk ? seedSpace(prefix) : 0;

  /** Show another prefix: a new one starts with the settings of the session left. */
  function switchTo(p: string) {
    setStats(null);
    setSelected(null);
    update(s => ({ ...s, prefix: p, draft: s.sessions[s.prefix] ? settingsOf(s.sessions[s.prefix]) : s.draft }));
  }

  const setSettings = (f: (s: Settings) => Settings) => update(s => s.sessions[s.prefix]
    ? { ...s, sessions: { ...s.sessions, [s.prefix]: { ...s.sessions[s.prefix], ...f(s.sessions[s.prefix]) } } }
    : { ...s, draft: f(s.draft) });

  function start() {
    if (running || !prefixOk) return;
    setError(null);
    const s = savedRef.current;
    const p = s.prefix;
    const sess = s.sessions[p] ?? newSession(p, s.draft);
    const base = sess.totals;
    // Saved candidates without trader camps go first, for the trader pass.
    const recheck = sess.candidates.filter(c => !hasTraders(c) && !sess.progress.queue.some(q => q.name === c.name))
      .map(c => ({ name: c.name, chance: c.chance }));
    const sc = new SeedScanner(
      { prefix: p, corridor: sess.corridor, screenOut: sess.screenOut / 100, workers: s.workers },
      { next: sess.progress.next, queue: [...recheck, ...sess.progress.queue] },
      {
        // A rechecked candidate keeps its heart.
        candidate: c => updateSession(p, x => {
          const old = x.candidates.find(o => o.name === c.name);
          return { ...x, candidates: [{ ...c, hearted: old?.hearted }, ...x.candidates.filter(o => o.name !== c.name)] };
        }),
        // A rechecked candidate that no longer passes keeps its place, with the fresh camps and altars.
        rejected: (name, altars) => {
          if (savedRef.current.sessions[p]?.candidates.some(x => x.name === name))
            updateSession(p, x => ({ ...x, candidates: x.candidates.map(o => (o.name === name ? { ...o, altars } : o)) }));
        },
        stats: st => {
          setStats(st);
          const progress = sc.progress();
          updateSession(p, x => ({ ...x, progress, totals: addRun(base, st) }));
        },
        error: message => { setError(message); setRunning(false); scanner.current = null; },
        done: () => { setRunning(false); scanner.current = null; },
      },
    );
    update(prev => ({ ...prev, sessions: { ...prev.sessions, [p]: { ...sess, updated: Date.now() } } }));
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
    updateSession(savedRef.current.prefix, x => ({ ...x, progress: p }));
  }

  function restart() {
    if (!confirm(`Start ${prefix} over from ${seedName(prefix, 0)}? Its candidates stay.`)) return;
    updateSession(prefix, x => ({ ...x, progress: { next: 0, queue: [] }, totals: noTotals() }));
    setStats(null);
  }

  function deleteSession(p: string) {
    const s = sessions[p];
    const hearts = s.candidates.filter(c => c.hearted).length;
    if (!confirm(`Delete the ${p} session: its progress and ${s.candidates.length} candidates` +
      `${hearts ? `, ${hearts} of them hearted` : ''}?`)) return;
    update(prev => {
      const rest = { ...prev.sessions };
      delete rest[p];
      return { ...prev, sessions: rest, draft: p === prev.prefix ? settingsOf(prev.sessions[p]) : prev.draft };
    });
    if (p === prefix) setStats(null);
  }

  const toggleHeart = (p: string, name: string) => updateSession(p, x => ({
    ...x, candidates: x.candidates.map(c => (c.name === name ? { ...c, hearted: c.hearted ? undefined : Date.now() } : c)),
  }));

  const judged = useMemo(() => candidates
    .map(c => ({ c, ...judge(corridor, traderRange, c) }))
    .sort((a, b) => Number(b.passes) - Number(a.passes) || Number(b.traders === true) - Number(a.traders === true)
      || a.worst - b.worst || b.c.found - a.c.found),
  [candidates, corridor, traderRange]);
  const traderCount = judged.filter(j => j.traders).length;
  const heartCount = candidates.filter(c => c.hearted).length;
  const shownRows = judged.filter(j => (!tradersOnly || j.traders) && (!heartedOnly || j.c.hearted));

  const sessionList = useMemo(() => Object.values(sessions).sort((a, b) => b.updated - a.updated), [sessions]);
  const allHearted = useMemo(() => sessionList
    .flatMap(s => s.candidates.filter(c => c.hearted).map(c => ({ prefix: s.prefix, c })))
    .sort((a, b) => b.c.hearted! - a.c.hearted!), [sessionList]);

  const shown = judged.find(j => j.c.name === (hovered ?? selected));

  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const setCorridor = (k: keyof Corridor, v: string, max: number) =>
    setSettings(s => ({ ...s, corridor: { ...s.corridor, [k]: num(v, 100, max) } }));
  const st = stats;
  const checked = totals.screenRejected + totals.exactDone;
  const emptyMessage = heartedOnly && tradersOnly ? 'None hearted with both traders nearby.'
    : heartedOnly ? 'None hearted yet: ♡ a candidate to keep it.'
    : tradersOnly && judged.length ? 'None with both traders nearby yet.' : 'None yet.';

  return (
    <div className="asf-page">
      <h1>Seed finder</h1>
      <p className="asf-sub">
        Scans seeds in this browser for worlds where every boss has an altar near a north-south line through spawn
        (pass 1), then looks for Haldor near the Elder and the Bog Witch near Bonemass (pass 2). Each seed gets a
        quick biome screen (tens of ms) that sets aside the least likely seeds, and the rest get the game&apos;s
        exact placement (~10 s per seed per worker). Each prefix is a session, with its own settings, progress and
        candidates, saved in this browser: switch between them and pick up where you left off. Heart the seeds you
        like to keep them.
      </p>

      <div className="asf-layout">
        <div className="asf-main">
          {(sessionList.length > 0 || allHearted.length > 0) && (
            <section className="asf-panel">
              <h2>Sessions</h2>
              <div className="asf-sessions">
                {sessionList.map(s => {
                  const hearts = s.candidates.filter(c => c.hearted).length;
                  const active = s.prefix === prefix;
                  return (
                    <div key={s.prefix} className={`asf-session ${active ? 'active' : ''}`}>
                      <button type="button" className="asf-session-open" disabled={running && !active} aria-pressed={active}
                              title={running && !active ? 'Stop the scan to switch' : `Show ${s.prefix}`}
                              onClick={() => { if (!active) switchTo(s.prefix); }}>
                        <code>{s.prefix}</code>
                        <span className="asf-session-meta">
                          {fmt(s.totals.screenRejected + s.totals.exactDone)} checked · {s.candidates.length} found
                          {hearts > 0 && <> · <span className="asf-heart-text">♥ {hearts}</span></>}
                        </span>
                        <span className="asf-session-meta">
                          {active && running ? 'running' : s.progress.next > 0 ? `at ${seedName(s.prefix, Math.min(s.progress.next, seedSpace(s.prefix) - 1))}` : 'not started'}
                          {' · '}{ago(s.updated)}
                        </span>
                      </button>
                      <button type="button" className="asf-session-del" aria-label={`Delete the ${s.prefix} session`}
                              disabled={running && active} onClick={() => deleteSession(s.prefix)}>×</button>
                    </div>
                  );
                })}
              </div>
              {allHearted.length > 0 && (
                <div className="asf-hearted">
                  <span className="asf-muted">Hearted:</span>
                  {allHearted.map(({ prefix: p, c }) => (
                    <button key={c.name} type="button" className="asf-hearted-seed" disabled={running && p !== prefix}
                            title={p === prefix ? `Select ${c.name}` : `Open the ${p} session and select ${c.name}`}
                            onClick={() => { if (p !== prefix) switchTo(p); setSelected(c.name); }}>
                      <span className="asf-heart-text">♥</span> <code>{c.name}</code>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="asf-panel">
            <form className="asf-controls" onSubmit={e => { e.preventDefault(); if (running) stop(); else start(); }}>
              <label title="Each prefix is its own session: type a new one to start one, or an old one to resume it.">Prefix
                <input value={prefix} maxLength={6} disabled={running} spellCheck={false}
                       onChange={e => switchTo(e.target.value.trim())} />
              </label>
              <label>Workers
                <input type="number" min={1} max={navigator.hardwareConcurrency || 16} value={workers} disabled={running}
                       onChange={e => update(s => ({ ...s, workers: num(e.target.value, 1, navigator.hardwareConcurrency || 16) }))} />
              </label>
              <label title="Screened seeds with the lowest estimated chance skip the exact check. 0 checks every seed exactly.">
                Screen out lowest (%)
                <input type="number" min={0} max={90} step={5} value={screenOut} disabled={running}
                       onChange={e => setSettings(s => ({ ...s, screenOut: num(e.target.value, 0, 90) }))} />
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
                       onChange={e => setSettings(s => ({ ...s, traderRange: num(e.target.value, 100, 10000) }))} />
              </label>
              <div className="asf-buttons">
                <button type="submit" disabled={!prefixOk} className={running ? 'asf-stop' : 'asf-start'}>
                  {running ? 'Stop' : progress.next > 0 || progress.queue.length > 0 ? 'Resume' : 'Start'}
                </button>
                <button type="button" onClick={restart} disabled={running || !session || (progress.next === 0 && checked === 0)}>Restart prefix</button>
              </div>
            </form>
            {!prefixOk && <div className="asf-error">The prefix is 1 to 6 letters or digits.</div>}
            {prefixOk && (
              <div className="asf-position">
                {running ? 'Screening at' : progress.next > 0 ? 'Resumes at' : 'Starts at'}{' '}
                <code>{seedName(prefix, Math.min(st?.next ?? progress.next, space - 1))}</code>
                <span className="asf-muted"> of {seedName(prefix, 0)} … {seedName(prefix, space - 1)}
                  {progress.queue.length > 0 && !running && ` · ${progress.queue.length} queued for the exact check`}
                  {!session && ' · a new session'}</span>
              </div>
            )}
            {error && <div className="asf-error">{error}</div>}

            <div className="asf-stats" aria-live="polite">
              <Stat label="Checked" value={fmt(checked)} hint={`${fmt(totals.screened)} screened`} />
              <Stat label="Candidates" value={fmt(candidates.length)} accent hint={`${fmt(traderCount)} with traders · ♥ ${fmt(heartCount)}`} />
              <Stat label="Screened out" value={fmt(totals.screenRejected)} />
              <Stat label="Rejected (exact)" value={fmt(totals.exactRejected)} />
              <Stat label="Seeds / s" value={st ? rate(st.rate) : '–'} hint={st ? `exact ${rate(st.exactRate)}/s` : undefined} />
              <Stat label="Per seed" value={st?.exactMs ? `${(st.exactMs / 1000).toFixed(1)} s` : '–'} hint={st?.screenMs ? `screen ${st.screenMs.toFixed(0)} ms` : undefined} />
              <Stat label="Exact running" value={st ? `${st.exactRunning}` : '–'} hint={st ? `${st.queued} queued` : undefined} />
              <Stat label="Elapsed" value={duration(totals.elapsedMs)} hint={st ? `this run ${duration(st.elapsedMs)}` : 'all runs'} />
            </div>

            {totals.exactRejected > 0 && (
              <div className="asf-missing">
                <h2>Why exact checks failed</h2>
                <p className="asf-muted">Share of this session&apos;s rejected seeds with no altar of each boss in the corridor.</p>
                {BOSSES.map((b, i) => {
                  const f = (totals.missing[i] ?? 0) / totals.exactRejected;
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
              <h2>Candidates <span className="asf-muted">({candidates.length}, {traderCount} with traders, {heartCount} hearted)</span></h2>
              <label className="asf-check">
                <input type="checkbox" checked={heartedOnly} onChange={e => update(s => ({ ...s, heartedOnly: e.target.checked }))} />
                Hearted only
              </label>
              <label className="asf-check">
                <input type="checkbox" checked={tradersOnly} onChange={e => update(s => ({ ...s, tradersOnly: e.target.checked }))} />
                Traders nearby only
              </label>
              {candidates.length > heartCount && (
                <button type="button" onClick={() => {
                  if (confirm(`Clear ${candidates.length - heartCount} candidates of ${prefix}?${heartCount ? ' Hearted ones stay.' : ''}`))
                    updateSession(prefix, x => ({ ...x, candidates: x.candidates.filter(c => c.hearted) }));
                }}>Clear</button>
              )}
            </div>
            {shownRows.length === 0
              ? <p className="asf-muted">{emptyMessage}</p>
              : (
                <div className="asf-table-wrap">
                  <table className="asf-table">
                    <thead>
                      <tr>
                        <th aria-label="Heart" />
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
                          <td className="asf-heart-cell">
                            <button type="button" className={`asf-heart ${c.hearted ? 'on' : ''}`} aria-pressed={!!c.hearted}
                                    aria-label={c.hearted ? `Unheart ${c.name}` : `Heart ${c.name}`}
                                    onClick={e => { e.stopPropagation(); toggleHeart(prefix, c.name); }}>{c.hearted ? '♥' : '♡'}</button>
                          </td>
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
                            <button type="button" aria-label={`Remove ${c.name}`} disabled={!!c.hearted} title={c.hearted ? 'Unheart it to remove it' : undefined}
                                    onClick={e => { e.stopPropagation(); updateSession(prefix, x => ({ ...x, candidates: x.candidates.filter(o => o.name !== c.name) })); }}>×</button>
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
            {TRADERS.map(t => <span key={t.prefab}><img className="asf-legend-icon" src={`/img/Poi/${t.icon}.svg`} alt="" />{t.label}</span>)}
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
      {/* Traders first, so the boss altars draw over them. */}
      {altars?.map(([prefab, x, z], i) => {
        const t = trader.get(prefab);
        if (t === undefined) return null;
        const s = 342;
        return <image key={i} href={`/img/Poi/${TRADERS[t].icon}.svg`} x={x - s} y={-z - s} width={2 * s} height={2 * s} />;
      })}
      {altars?.map(([prefab, x, z], i) => {
        if (trader.has(prefab)) return null;
        const inside = inCorridor(corridor, x, z);
        return <circle key={i} cx={x} cy={-z} r={inside ? 230 : 190} className={inside ? 'asf-d-altar' : 'asf-d-altar out'}
                       style={{ fill: inside ? color.get(prefab) : 'none', stroke: color.get(prefab) }} />;
      })}
      <circle r={170} className="asf-d-spawn" />
    </svg>
  );
}
