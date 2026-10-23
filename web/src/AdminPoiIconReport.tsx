import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BUILTIN_ICONS, getPoiConfig, loadSvgText, getColoredIconDataUrl, usePoiConfigVersion,
} from './components/poiIcons';
import { SvgStats, svgStats, median } from './components/svgStats';
import { toast } from './components/toast';

// Vector complexity report for the POI icon art: what each SVG costs to ship
// and to draw, against the set's medians, with the obvious optimisations called out.

/// An icon this many times the median point count is worth simplifying.
const HEAVY_FACTOR = 2;
/// More decimal places than this buys nothing at map-marker sizes.
const MAX_USEFUL_DECIMALS = 2;

interface Row extends SvgStats {
  name: string;
  uploaded: boolean;
  usedBy: string[];
  ratio: number;           // points / median points
  flags: string[];
}

type SortKey = 'name' | 'usedBy' | 'bytes' | 'geometry' | 'commands' | 'points' | 'maxDecimals' | 'ratio';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'name', label: 'Icon', title: 'SVG name' },
  { key: 'usedBy', label: 'Used by', title: 'POI prefabs rendering with this icon' },
  { key: 'bytes', label: 'Size', title: 'File size' },
  { key: 'geometry', label: 'Geometry', title: 'Drawable elements: path, circle, rect, …' },
  { key: 'commands', label: 'Segments', title: 'Path commands, including implicit repeats' },
  { key: 'points', label: 'Points', title: 'Anchor + control points' },
  { key: 'ratio', label: '× median', title: 'Points relative to the median icon' },
  { key: 'maxDecimals', label: 'Precision', title: 'Most decimal places on any coordinate' },
];

const fmtBytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

/// Dev server only: replace public/img/Poi/<name>.svg with its SVGO-optimized
/// copy (poi-icons-plugin.ts keeps the original under node_modules/.cache/poi-svgo).
/// The file watcher then reloads the icon, which re-measures it here.
function SvgoButton({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/__poi/svgo?name=${encodeURIComponent(name)}`, { method: 'POST' });
      const res = await r.json() as { before: number; after: number; changed: boolean; error?: string };
      if (!r.ok) throw new Error(res.error ?? `HTTP ${r.status}`);
      if (res.changed) toast.success(`${name}.svg optimized: ${fmtBytes(res.before)} → ${fmtBytes(res.after)}`);
      else toast.info(`${name}.svg is already optimized`);
    } catch (err) {
      toast.error(`SVGO ${name} failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="apoi-link" disabled={busy} onClick={run}
            title={`Replace public/img/Poi/${name}.svg with its SVGO-optimized copy (the build's settings)`}>
      {busy ? 'SVGO…' : 'SVGO'}
    </button>
  );
}
const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

function Preview({ name }: { name: string }) {
  const version = usePoiConfigVersion();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getColoredIconDataUrl(name, '#ffffff').then(s => { if (!cancelled) setSrc(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [name, version]);
  return src ? <img className="apoi-cx-icon" src={src} alt="" /> : <span className="apoi-cx-icon" />;
}

/// `usage` maps icon name -> POI prefabs currently drawing with it.
export default function AdminPoiIconReport({ usage }: { usage: Record<string, string[]> }) {
  const version = usePoiConfigVersion();
  const [stats, setStats] = useState<Record<string, SvgStats> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'points', dir: -1 });

  const uploaded = Object.keys(getPoiConfig().icons);
  const names = useMemo(
    () => [...new Set([...BUILTIN_ICONS, ...uploaded])].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-list when uploads change
    [version],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(names.map(async n => [n, svgStats(await loadSvgText(n))] as const))
      .then(entries => { if (!cancelled) setStats(Object.fromEntries(entries)); })
      .catch(err => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [names]);

  const { rows, med, totalBytes } = useMemo(() => {
    if (!stats) return { rows: [] as Row[], med: null, totalBytes: 0 };
    const list = Object.entries(stats).map(([name, s]) => ({ name, ...s }));
    const med = {
      geometry: median(list.map(s => s.geometry)),
      commands: median(list.map(s => s.commands)),
      points: median(list.map(s => s.points)),
      bytes: median(list.map(s => s.bytes)),
    };
    const rows: Row[] = list.map(s => {
      const usedBy = usage[s.name] ?? [];
      const ratio = med.points ? s.points / med.points : 0;
      const flags: string[] = [];
      if (ratio >= HEAVY_FACTOR) flags.push(`Heavy: ${ratio.toFixed(1)}× the median points — simplify the paths`);
      if (s.maxDecimals > MAX_USEFUL_DECIMALS) flags.push(`${s.maxDecimals} decimal places — round to ${MAX_USEFUL_DECIMALS}`);
      if (!s.hasCurrentColor) flags.push('No currentColor — per-type colour won\'t apply');
      if (s.geometry > 1 && s.paths === s.geometry) flags.push(`${s.paths} paths — could merge into one`);
      if (usedBy.length === 0) flags.push('Unused by any shown prefab');
      return { ...s, usedBy, ratio, flags, uploaded: uploaded.includes(s.name) };
    });
    return { rows, med, totalBytes: list.reduce((a, s) => a + s.bytes, 0) };
  }, [stats, usage, uploaded]);

  const sorted = useMemo(() => {
    const val = (r: Row) => (sort.key === 'usedBy' ? r.usedBy.length : r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return c * sort.dir || a.name.localeCompare(b.name);
    });
  }, [rows, sort]);

  const onSort = (key: SortKey) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 });

  if (error) return <section className="apoi-icons"><h3>Icon art complexity</h3><div className="apoi-error">{error}</div></section>;
  if (!stats || !med) return <section className="apoi-icons"><h3>Icon art complexity</h3><p className="apoi-sub">Measuring…</p></section>;

  const heavy = rows.filter(r => r.ratio >= HEAVY_FACTOR);
  const precise = rows.filter(r => r.maxDecimals > MAX_USEFUL_DECIMALS);
  const unused = rows.filter(r => r.usedBy.length === 0);
  const heaviest = [...rows].sort((a, b) => b.points - a.points)[0];

  return (
    <section className="apoi-icons" aria-labelledby="apoi-cx-title">
      <h3 id="apoi-cx-title">Icon art complexity</h3>
      <p className="apoi-sub">
        Vector cost of every icon the map can draw (built-in and uploaded), measured from the SVG the map loads.
        Points count anchors and curve controls, which is what a marker costs to draw at every zoom level.
      </p>

      <div className="apoi-stats">
        <div className="apoi-stat"><span>{rows.length}</span>icons</div>
        <div className="apoi-stat"><span>{fmtNum(med.geometry)}</span>median geometry</div>
        <div className="apoi-stat"><span>{fmtNum(med.commands)}</span>median segments</div>
        <div className="apoi-stat"><span>{fmtNum(med.points)}</span>median points</div>
        <div className="apoi-stat"><span>{fmtBytes(med.bytes)}</span>median size</div>
        <div className="apoi-stat"><span>{fmtBytes(totalBytes)}</span>total</div>
      </div>

      <ul className="apoi-cx-findings">
        {heaviest && (
          <li>Heaviest: <code>{heaviest.name}</code> at {heaviest.points.toLocaleString()} points
            ({heaviest.ratio.toFixed(1)}× the median, {fmtBytes(heaviest.bytes)}).</li>
        )}
        <li>
          {heavy.length === 0
            ? `No icon is over ${HEAVY_FACTOR}× the median point count.`
            : <>{heavy.length} icon{heavy.length === 1 ? ' is' : 's are'} over {HEAVY_FACTOR}× the median point count: {heavy.map(r => <code key={r.name}>{r.name}</code>).reduce<ReactNode[]>((a, c, i) => (i ? [...a, ', ', c] : [c]), [])}.</>}
        </li>
        {precise.length > 0 && (
          <li>{precise.length} icon{precise.length === 1 ? ' uses' : 's use'} more than {MAX_USEFUL_DECIMALS} decimal
            places; rounding (e.g. SVGO <code>floatPrecision: 2</code>) shrinks them with no visible change at marker size.</li>
        )}
        {unused.length > 0 && (
          <li>{unused.length} icon{unused.length === 1 ? ' isn\'t' : 's aren\'t'} used by any shown prefab
            ({unused.map(r => r.name).join(', ')}).</li>
        )}
      </ul>

      <div className="apoi-table-wrap">
        <table className="apoi-table apoi-cx-table">
          <thead>
            <tr>
              {COLUMNS.map(c => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} title={c.title} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                      className={c.key === 'name' ? undefined : 'apoi-num'}>
                    <button className={`apoi-sort ${active ? 'on' : ''}`} onClick={() => onSort(c.key)}>
                      {c.label}
                      <span className="apoi-sort-arrow" aria-hidden="true">{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                );
              })}
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.name}>
                <td>
                  <span className="apoi-cx-name">
                    <Preview name={r.name} />
                    <code>{r.name}</code>
                    {r.uploaded && <span className="apoi-tag">uploaded</span>}
                    {import.meta.env.DEV && BUILTIN_ICONS.includes(r.name) && <SvgoButton name={r.name} />}
                  </span>
                </td>
                <td className="apoi-num" title={r.usedBy.join(', ')}>{r.usedBy.length || '—'}</td>
                <td className="apoi-num">{fmtBytes(r.bytes)}</td>
                <td className="apoi-num">{r.geometry}</td>
                <td className="apoi-num">{r.commands.toLocaleString()}</td>
                <td className="apoi-num">{r.points.toLocaleString()}</td>
                <td className={`apoi-num ${r.ratio >= HEAVY_FACTOR ? 'apoi-cx-hot' : ''}`}>{r.ratio.toFixed(1)}×</td>
                <td className={`apoi-num ${r.maxDecimals > MAX_USEFUL_DECIMALS ? 'apoi-cx-hot' : ''}`}>{r.maxDecimals} dp</td>
                <td className="apoi-cx-notes">{r.flags.length ? r.flags.join(' · ') : <span className="apoi-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
