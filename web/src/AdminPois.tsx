import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import Spinner from './components/Spinner';
import { useAuth } from './contexts/AuthContext';
import {
  PoiMarker, PoiSetting, BUILTIN_ICONS, FALLBACK_ICON, LOD_LEVELS, LOD_ZOOM, DOT_ZOOM, LOD_LABELS,
  resolvePoiIcon, defaultPoiIcon, getColoredIconDataUrl,
  getPoiConfig, getPoiConfigError, setPoiConfig, usePoiConfigVersion,
} from './components/poiIcons';
import { Toaster } from './components/Toasts';
import { toast } from './components/toast';
import { SPOILER_BIOMES } from './guides/vh/spoiler';
import { biomeIconUrl } from './guides/vh/data';
import AdminPoiIconReport from './AdminPoiIconReport';
import './AdminPois.css';

// Admin worklist for POI icons, one row per prefab. Rows come from a real seed's
// `pois` artifact (seedgen emits every location the game places), run through
// the same resolvePoiIcon the maps use. The game's types supply the code
// defaults; edits are per-prefab overrides stored by the API
// (api/ModuleWorlds/WorldsPoiConfig.cs) and apply to every map immediately.

const DEFAULT_SEED = 'NewDNTest';

// seedgen's Biome enum names -> SPOILER_BIOMES index (progression order).
const BIOME_INDEX: Record<string, number> = Object.fromEntries(
  SPOILER_BIOMES.map((b, i) => [b.label.replace(/\s/g, '').toLowerCase(), i]));
const biomeIndexOf = (name?: string) => (name ? BIOME_INDEX[name.toLowerCase()] : undefined);

/// A biome counts toward a prefab if it holds at least this share of its POIs —
/// keeps a stray beach shipwreck from adding a bubble.
const BIOME_MIN_SHARE = 0.1;

type IconStatus = 'own' | 'borrowed' | 'none';
type Visibility = 'shown' | 'partial' | 'hidden';

interface PrefabRow {
  prefab: string;
  type: string;
  name: string;            // in-game name, e.g. "Burial Chamber"
  biomes: number[];        // SPOILER_BIOMES indices, ascending
  total: number;
  visible: number;
  visibility: Visibility;
  iconStatus: IconStatus;
  icons: { icon: string; color: string }[];
  lod: number;             // level of detail of the drawn icons (0-3)
  hasDefault: boolean;     // the type's code rule renders at least one POI of this prefab
  overridden: boolean;
}

const ICON_LABEL: Record<IconStatus, string> = { own: 'Own art', borrowed: 'Borrowed', none: 'No icon' };
/// When to pick each LOD, for the key above the table.
const LOD_GUIDE: readonly string[] = [
  'landmarks you navigate by: bosses, traders, the start, the Forge.',
  'what players plan a run around: vegvisirs, quests, drake nests, crypts.',
  'the default for dungeons, camps and caves.',
  'filler that would clutter the map: houses, huts, tar pits, geysers.',
];

const VIS_LABEL: Record<Visibility, string> ={ shown: 'Shown', partial: 'Partly shown', hidden: 'Hidden' };
const STATUS_ORDER: Record<IconStatus, number> = { none: 0, borrowed: 1, own: 2 };
const VIS_ORDER: Record<Visibility, number> = { hidden: 0, partial: 1, shown: 2 };

type SortKey = 'biome' | 'prefab' | 'type' | 'visibility' | 'icon' | 'lod' | 'count';
interface Sort { key: SortKey; dir: 1 | -1 }
const DEFAULT_SORT: Sort = { key: 'biome', dir: 1 };

// Primary sort value per column; ties fall back to type, then prefab, ascending —
// so a type's prefabs always sit together.
const SORT_VALUE: Record<SortKey, (r: PrefabRow) => number | string> = {
  biome: r => r.biomes[0] ?? SPOILER_BIOMES.length,
  prefab: r => r.prefab.toLowerCase(),
  type: r => r.type.toLowerCase(),
  visibility: r => VIS_ORDER[r.visibility],
  icon: r => STATUS_ORDER[r.iconStatus],
  lod: r => (r.visible === 0 ? LOD_LEVELS.length : r.lod),
  count: r => r.total,
};

function sortRows(rows: PrefabRow[], sort: Sort): PrefabRow[] {
  const val = SORT_VALUE[sort.key];
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    const primary = va < vb ? -1 : va > vb ? 1 : 0;
    return primary * sort.dir || a.type.localeCompare(b.type) || a.prefab.localeCompare(b.prefab);
  });
}

function buildRows(pois: PoiMarker[]): PrefabRow[] {
  const groups = new Map<string, PoiMarker[]>();
  for (const p of pois) {
    const key = p.prefab ?? `(${p.type})`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  // Which built-in icons each *type* uses by default — an override that picks
  // another type's icon is borrowed art (prefabs of one type sharing is fine).
  const defaultIconOwners = new Map<string, Set<string>>();
  for (const list of groups.values())
    for (const p of list) {
      const d = defaultPoiIcon(p);
      if (!d || d.borrowed) continue;
      if (!defaultIconOwners.has(d.icon)) defaultIconOwners.set(d.icon, new Set());
      defaultIconOwners.get(d.icon)!.add(p.type);
    }

  const config = getPoiConfig();
  const rows: PrefabRow[] = [];
  for (const [prefab, list] of groups) {
    const type = list[0].type;
    const biomeCounts = new Map<number, number>();
    const icons = new Map<string, { icon: string; color: string }>();
    let visible = 0, borrowed = false, lod = 0, hasDefault = false;
    for (const p of list) {
      const b = biomeIndexOf(p.biome);
      if (b !== undefined) biomeCounts.set(b, (biomeCounts.get(b) ?? 0) + 1);
      if (defaultPoiIcon(p)) hasDefault = true;
      const rule = resolvePoiIcon(p);
      if (!rule) continue;
      visible++;
      const pickedOthers = !!config.prefabs[prefab]?.icon &&
        [...(defaultIconOwners.get(rule.icon) ?? [])].some(t => t !== type);
      const uploaded = rule.icon in config.icons;
      borrowed ||= !uploaded && (!!rule.borrowed || rule.icon === FALLBACK_ICON || pickedOthers);
      lod = Math.max(lod, rule.lod ?? 0);
      icons.set(rule.icon + '|' + rule.color, { icon: rule.icon, color: rule.color });
    }
    rows.push({
      prefab,
      type,
      name: list[0].name,
      biomes: [...biomeCounts].filter(([, n]) => n / list.length >= BIOME_MIN_SHARE)
        .map(([b]) => b).sort((a, b) => a - b),
      total: list.length,
      visible,
      visibility: visible === 0 ? 'hidden' : visible < list.length ? 'partial' : 'shown',
      iconStatus: visible === 0 ? 'none' : borrowed ? 'borrowed' : 'own',
      icons: [...icons.values()],
      lod,
      hasDefault,
      overridden: prefab in config.prefabs,
    });
  }
  return rows;
}

// ── API ──────────────────────────────────────────────────────────────────────

async function apiJson(url: string, init: RequestInit): Promise<Response> {
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(await errorMessage(r));
  return r;
}

/// A readable message from a failed response: our endpoints return plain-text
/// reasons; ASP.NET's unhandled errors are ProblemDetails JSON.
async function errorMessage(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const p = JSON.parse(text) as { title?: string; detail?: string };
    if (p.title) return `${r.status} ${p.title}${p.detail ? ` — ${p.detail}` : ''}`;
  } catch { /* not JSON */ }
  return text ? `${r.status} ${text}` : `HTTP ${r.status} ${r.statusText}`;
}

/// Merge `patch` into the prefab's override and save it. All-null clears it.
async function saveSetting(prefab: string, patch: PoiSetting) {
  const cur = getPoiConfig().prefabs[prefab] ?? {};
  const next: PoiSetting = {
    visible: 'visible' in patch ? patch.visible : cur.visible ?? null,
    icon: 'icon' in patch ? patch.icon : cur.icon ?? null,
    color: 'color' in patch ? patch.color : cur.color ?? null,
    lod: 'lod' in patch ? patch.lod : cur.lod ?? null,
  };
  await apiJson('/api/admin/poi/settings', { method: 'PUT', body: JSON.stringify({ prefab, ...next }) });
  const cfg = getPoiConfig();
  const prefabs = { ...cfg.prefabs };
  if (next.visible == null && next.icon == null && next.color == null && next.lod == null) delete prefabs[prefab];
  else prefabs[prefab] = next;
  setPoiConfig({ ...cfg, prefabs });
}

async function resetSetting(prefab: string) {
  await apiJson('/api/admin/poi/settings', { method: 'PUT', body: JSON.stringify({ prefab }) });
  const cfg = getPoiConfig();
  const prefabs = { ...cfg.prefabs };
  delete prefabs[prefab];
  setPoiConfig({ ...cfg, prefabs });
}

/// Drop every override so all prefabs follow the code defaults again — e.g.
/// after a deploy that folded the overrides into poiIcons.ts.
async function resetAllSettings(): Promise<number> {
  const r = await apiJson('/api/admin/poi/settings', { method: 'DELETE' });
  const { removed } = await r.json() as { removed: number };
  setPoiConfig({ ...getPoiConfig(), prefabs: {} });
  return removed;
}

async function uploadIcon(name: string, svg: string) {
  const r = await apiJson(`/api/admin/poi/icons/${encodeURIComponent(name)}`, {
    method: 'PUT', body: JSON.stringify({ svg }),
  });
  const { version } = await r.json() as { name: string; version: number };
  const cfg = getPoiConfig();
  setPoiConfig({ ...cfg, icons: { ...cfg.icons, [name]: version } });
}

async function deleteIcon(name: string) {
  await apiJson(`/api/admin/poi/icons/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const cfg = getPoiConfig();
  const icons = { ...cfg.icons };
  delete icons[name];
  setPoiConfig({ ...cfg, icons });
}

// ── Small components ─────────────────────────────────────────────────────────

function IconImg({ icon, color }: { icon: string; color: string }) {
  const version = usePoiConfigVersion();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getColoredIconDataUrl(icon, color)
      .then(s => { if (!cancelled) setSrc(s); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [icon, color, version]);
  return src ? <img src={src} alt="" /> : <span className="apoi-swatch-empty" />;
}

function IconSwatch({ icon, color }: { icon: string; color: string }) {
  return (
    <span className="apoi-swatch" title={`${icon} · ${color}`}>
      <IconImg icon={icon} color={color} />
      <code>{icon}</code>
    </span>
  );
}

function BiomeBubbles({ biomes }: { biomes: number[] }) {
  if (biomes.length === 0) return <span className="apoi-muted" title="Unknown biome">?</span>;
  const labels = biomes.map(i => SPOILER_BIOMES[i].label);
  return (
    <span className="apoi-biomes" title={labels.join(', ')} aria-label={labels.join(', ')}>
      {biomes.map(i => {
        const b = SPOILER_BIOMES[i];
        return (
          <span key={b.key} className="apoi-biome">
            {b.icon ? <img src={biomeIconUrl(b.icon)} alt="" /> : null}
          </span>
        );
      })}
    </span>
  );
}

function SortHeader({ label, k, sort, onSort, className }: {
  label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className={`apoi-sort ${active ? 'on' : ''}`} onClick={() => onSort(k)}>
        {label}
        <span className="apoi-sort-arrow" aria-hidden="true">{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

function FilterChips<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | 'all';
  options: { value: T | 'all'; label: string; count: number }[];
  onChange: (v: T | 'all') => void;
}) {
  return (
    <div className="apoi-filter" role="group" aria-label={label}>
      <span className="apoi-filter-label">{label}</span>
      {options.map(o => (
        <button
          key={o.value}
          className={`apoi-chip ${value === o.value ? 'on' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label} <span className="apoi-chip-count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/// Shown/hidden switch. Turning a prefab on returns it to its type's code rule
/// when it has one; otherwise forces it on.
function VisibilitySwitch({ row, run }: { row: PrefabRow; run: (f: () => Promise<void>) => void }) {
  const on = row.visible > 0;
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={`${row.prefab} shown on map`}
      className={`apoi-switch ${on ? 'on' : ''}`}
      onClick={() => run(() => saveSetting(row.prefab, { visible: on ? false : row.hasDefault ? null : true }))}
    >
      <span className="apoi-switch-knob" />
    </button>
  );
}

function allIconNames(): string[] {
  return [...new Set([...BUILTIN_ICONS, ...Object.keys(getPoiConfig().icons)])].sort();
}

/// Inline LOD selector: which zoom level this prefab's dots turn into icons.
function LodPicker({ row, run }: { row: PrefabRow; run: (f: () => Promise<void>) => void }) {
  const disabled = row.visible === 0;
  return (
    <div className="apoi-lod" role="radiogroup" aria-label={`Level of detail for ${row.prefab}`}>
      {LOD_LEVELS.map(l => (
        <button
          key={l}
          role="radio"
          aria-checked={!disabled && row.lod === l}
          disabled={disabled}
          className={`apoi-lod-btn ${!disabled && row.lod === l ? 'on' : ''}`}
          title={l === 0 ? 'LOD 0: always an icon' : `LOD ${l} (${LOD_LABELS[l]}): hidden below zoom ${DOT_ZOOM[l]}×, a dot until ${LOD_ZOOM[l]}×, then an icon`}
          onClick={() => run(() => saveSetting(row.prefab, { lod: l }))}
        >{l}</button>
      ))}
    </div>
  );
}

function PrefabEditor({ row, run }: { row: PrefabRow; run: (f: () => Promise<void>) => void }) {
  usePoiConfigVersion();
  const override = getPoiConfig().prefabs[row.prefab] ?? {};
  const current = row.icons[0] ?? { icon: FALLBACK_ICON, color: '#ffffff' };
  const [color, setColor] = useState(override.color ?? current.color);
  const colorTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(colorTimer.current), []);

  const onColor = (c: string) => {
    setColor(c);
    // The native picker fires on every drag step; save once it settles.
    window.clearTimeout(colorTimer.current);
    colorTimer.current = window.setTimeout(() => run(() => saveSetting(row.prefab, { color: c })), 500);
  };
  const pickIcon = (icon: string) => run(() => saveSetting(row.prefab, {
    icon,
    // Choosing art for a prefab with no code rule implies you want it on the map.
    ...(row.visible === 0 && override.visible !== false ? { visible: true } : {}),
  }));

  return (
    <div className="apoi-editor">
      <div className="apoi-editor-grid" role="radiogroup" aria-label={`Icon for ${row.prefab}`}>
        {allIconNames().map(name => {
          const selected = (override.icon ?? (row.icons.length === 1 ? current.icon : '')) === name;
          return (
            <button
              key={name}
              role="radio"
              aria-checked={selected}
              className={`apoi-icon-choice ${selected ? 'on' : ''}`}
              title={name}
              onClick={() => pickIcon(name)}
            >
              <IconImg icon={name} color={color} />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <div className="apoi-editor-row">
        <label>
          Colour
          <input type="color" value={color} onChange={e => onColor(e.target.value)} />
        </label>
        {row.overridden && (
          <button className="apoi-link" onClick={() => run(async () => {
            await resetSetting(row.prefab);
            setColor(row.icons[0]?.color ?? '#ffffff');
          })}>Reset to {row.type} default</button>
        )}
      </div>
    </div>
  );
}

function IconManager({ run }: { run: (f: () => Promise<void>) => void }) {
  usePoiConfigVersion();
  const uploaded = Object.keys(getPoiConfig().icons).sort();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f: File | null) => {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;
    run(async () => {
      const svg = await file.text();
      await uploadIcon(name, svg);
      if (!svg.includes('currentColor'))
        toast.warn(`Uploaded "${name}", but it has no currentColor fills, so the per-prefab colour won't apply.`);
      setName('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    });
  };

  return (
    <section className="apoi-icons">
      <h3>Icon art</h3>
      <p className="apoi-sub">
        Upload an SVG to add new art, or use a built-in name (e.g. <code>fortress</code>) to replace that icon
        everywhere. Use <code>fill="currentColor"</code> so the per-prefab colour applies.
      </p>
      <form className="apoi-upload" onSubmit={submit}>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml" onChange={e => onFile(e.target.files?.[0] ?? null)} />
        <input
          aria-label="Icon name"
          placeholder="icon-name"
          value={name}
          onChange={e => setName(e.target.value.toLowerCase())}
          pattern="[a-z0-9][a-z0-9_\-]{0,39}"
        />
        <button type="submit" disabled={!file || !name}>
          {BUILTIN_ICONS.includes(name) || uploaded.includes(name) ? 'Replace' : 'Upload'}
        </button>
      </form>
      {uploaded.length > 0 && (
        <div className="apoi-uploaded">
          {uploaded.map(n => (
            <span key={n} className="apoi-uploaded-item">
              <IconImg icon={n} color="#ffffff" />
              <code>{n}</code>
              {BUILTIN_ICONS.includes(n) && <span className="apoi-muted">(replaces built-in)</span>}
              {confirmDelete === n ? (
                <>
                  <button className="apoi-link danger" onClick={() => run(async () => { await deleteIcon(n); setConfirmDelete(null); })}>
                    Confirm delete
                  </button>
                  <button className="apoi-link" onClick={() => setConfirmDelete(null)}>Cancel</button>
                </>
              ) : (
                <button className="apoi-link" onClick={() => setConfirmDelete(n)}>Delete</button>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// Rendered by scripts/render_poi_previews.py from the game's own prefabs; stored in renders.db.
const previewUrl = (prefab: string) => `/api/poi/preview/${encodeURIComponent(prefab)}.webp`;

function PreviewThumb({ row, onOpen }: { row: PrefabRow; onOpen: () => void }) {
  const [missing, setMissing] = useState(false);
  return (
    <button className="apoi-thumb-btn" onClick={onOpen} title={`Preview ${row.prefab}`}>
      {missing
        ? <span className="apoi-prefab-thumb empty" aria-hidden="true" />
        : <img className="apoi-prefab-thumb" src={previewUrl(row.prefab)} alt="" loading="lazy" onError={() => setMissing(true)} />}
    </button>
  );
}

function PreviewDialog({ row, onClose }: { row: PrefabRow | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    setMissing(false);
    if (row && !d.open) d.showModal();
    if (!row && d.open) d.close();
  }, [row]);
  return (
    <dialog
      ref={ref}
      className="apoi-preview"
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {row && (
        <div className="apoi-preview-body">
          {missing
            ? (
              <div className="apoi-preview-img empty">
                No preview. Villages and camps are assembled by the game at runtime, and some
                locations are effects only, so there's no model to render. For anything else, run{' '}
                <code>scripts/render_poi_previews.py {row.prefab}</code>
              </div>
            )
            : <img className="apoi-preview-img" src={previewUrl(row.prefab)} alt={`${row.prefab} rendered from the game files`} onError={() => setMissing(true)} />}
          <div className="apoi-preview-meta">
            <code>{row.prefab}</code>
            <span>{row.name} · {row.type}</span>
            <span className="apoi-muted">{row.total.toLocaleString()} in this world</span>
          </div>
          <button className="apoi-link" onClick={onClose} autoFocus>Close</button>
        </div>
      )}
    </dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const fetchPois = async (seed: string): Promise<PoiMarker[]> => {
  const res = await fetch(`/api/worlds/${encodeURIComponent(seed)}/pois`);
  if (res.status === 404) throw new Error(`No POI data for "${seed}" yet — open it on the Worlds page to generate it.`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const COLUMNS = 8;

const AdminPois: React.FC = () => {
  const { status } = useAuth();
  const configVersion = usePoiConfigVersion();
  const [params, setParams] = useSearchParams();
  const seed = params.get('seed') || DEFAULT_SEED;
  const [seedInput, setSeedInput] = useState(seed);
  const [vis, setVis] = useState<Visibility | 'all'>('all');
  const [iconFilter, setIconFilter] = useState<IconStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrefabRow | null>(null);

  // Same column flips direction; a new column starts ascending (largest-first for counts).
  const onSort = (key: SortKey) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'count' ? -1 : 1 });

  const run = (f: () => Promise<void>) => {
    f().then(() => toast.success('Saved'), err => toast.error(`Save failed: ${(err as Error).message}`));
  };

  // A failed config fetch leaves every prefab on its code default — say so.
  useEffect(() => {
    const err = getPoiConfigError();
    if (err) toast.error(`Couldn't load POI settings (showing code defaults): ${err.message}`);
  }, [configVersion]);

  const { data, error, isLoading, isError } = useQuery<PoiMarker[]>({
    queryKey: ['admin-pois', seed],
    queryFn: () => fetchPois(seed),
    enabled: status?.id === 1,
    retry: false,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- configVersion invalidates resolvePoiIcon's overrides
  const rows = useMemo(() => buildRows(data ?? []), [data, configVersion]);
  // Icon -> prefabs currently drawing with it, for the complexity report.
  const iconUsage = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of rows) for (const i of r.icons) (m[i.icon] ??= []).push(r.prefab);
    return m;
  }, [rows]);
  const q = query.trim().toLowerCase();
  const shown = sortRows(rows.filter(r =>
    (vis === 'all' || r.visibility === vis) && (iconFilter === 'all' || r.iconStatus === iconFilter) &&
    (!q || r.prefab.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))), sort);

  if (status?.id !== 1) {
    return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  }

  // Every saved override, including prefabs this seed doesn't happen to place.
  const editedCount = Object.keys(getPoiConfig().prefabs).length;
  const count = <K extends keyof PrefabRow>(k: K, v: PrefabRow[K]) => rows.filter(r => r[k] === v).length;

  return (
    <div id="admin-pois">
      <h2>POI Icons</h2>
      <div className="apoi-header">
        <p className="apoi-sub">
          Every location prefab the game places, from a generated world. Each prefab starts from its type&apos;s
          default; toggle it to show or hide it on every map, <strong>Edit</strong> its icon and colour, and set
          its <strong>LOD</strong>. Changes save immediately.
        </p>
        <form
          className="apoi-seed"
          onSubmit={e => {
            e.preventDefault();
            const s = seedInput.trim();
            if (s) setParams(s === DEFAULT_SEED ? {} : { seed: s });
          }}
        >
          <label htmlFor="apoi-seed">Seed</label>
          <input id="apoi-seed" value={seedInput} onChange={e => setSeedInput(e.target.value)} />
          <button type="submit">Load</button>
        </form>
      </div>

      <Toaster />

      {isLoading && <Spinner />}
      {isError && <div className="apoi-error">{(error as Error).message}</div>}

      {data && (
        <>
          <div className="apoi-stats">
            <div className="apoi-stat"><span>{rows.length}</span>prefabs</div>
            <div className="apoi-stat"><span>{new Set(rows.map(r => r.type)).size}</span>types</div>
            <div className="apoi-stat"><span>{count('visibility', 'shown') + count('visibility', 'partial')}</span>shown</div>
            <div className="apoi-stat"><span>{count('visibility', 'hidden')}</span>hidden</div>
            <div className="apoi-stat"><span>{count('iconStatus', 'own')}</span>own art</div>
            <div className="apoi-stat warn"><span>{count('iconStatus', 'borrowed')}</span>borrowed art</div>
            <div className="apoi-stat"><span>{editedCount}</span>edited</div>
            <button
              className="apoi-reset-all"
              disabled={editedCount === 0}
              title="Drop every admin override so each prefab uses the default from the code"
              onClick={() => {
                if (!window.confirm(`Reset all ${editedCount} edited prefabs to the code defaults? This can't be undone.`)) return;
                resetAllSettings().then(
                  n => toast.success(`Reset ${n} prefab${n === 1 ? '' : 's'} to defaults`),
                  err => toast.error(`Reset failed: ${(err as Error).message}`));
              }}
            >Reset all to defaults</button>
          </div>

          <div className="apoi-filters">
            <input
              className="apoi-search"
              type="search"
              placeholder="Filter by prefab, type or name"
              aria-label="Filter prefabs"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <FilterChips label="Visibility" value={vis} onChange={setVis} options={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'shown', label: VIS_LABEL.shown, count: count('visibility', 'shown') },
              { value: 'partial', label: VIS_LABEL.partial, count: count('visibility', 'partial') },
              { value: 'hidden', label: VIS_LABEL.hidden, count: count('visibility', 'hidden') },
            ]} />
            <FilterChips label="Icon" value={iconFilter} onChange={setIconFilter} options={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'own', label: ICON_LABEL.own, count: count('iconStatus', 'own') },
              { value: 'borrowed', label: ICON_LABEL.borrowed, count: count('iconStatus', 'borrowed') },
              { value: 'none', label: ICON_LABEL.none, count: count('iconStatus', 'none') },
            ]} />
          </div>

          <div className="apoi-sub apoi-lod-key">
            <strong>LOD (level of detail)</strong> decides how early a POI appears as you zoom in: hidden, then a dot, then
            its icon. A whole world fits the screen at about 0.9× on a desktop and 0.35× on a phone.
            <ul>
              {LOD_LEVELS.map(l => (
                <li key={l}>
                  <b>{l} {LOD_LABELS[l]}</b>
                  {' '}({l === 0 ? 'icon at every zoom' : `dot from ${DOT_ZOOM[l]}×, icon from ${LOD_ZOOM[l]}×`}) — {LOD_GUIDE[l]}
                </li>
              ))}
            </ul>
          </div>
          <div className="apoi-table-wrap">
            <table className="apoi-table">
              <thead>
                <tr>
                  <SortHeader label="Biome" k="biome" sort={sort} onSort={onSort} className="apoi-col-biome" />
                  <th className="apoi-col-thumb"><span className="sr-only">Preview</span></th>
                  <SortHeader label="Prefab" k="prefab" sort={sort} onSort={onSort} />
                  <SortHeader label="Type" k="type" sort={sort} onSort={onSort} />
                  <SortHeader label="Visibility" k="visibility" sort={sort} onSort={onSort} />
                  <SortHeader label="Icon" k="icon" sort={sort} onSort={onSort} />
                  <SortHeader label="LOD" k="lod" sort={sort} onSort={onSort} />
                  <SortHeader label="Count" k="count" sort={sort} onSort={onSort} className="apoi-num" />
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <React.Fragment key={r.prefab}>
                    <tr className={editing === r.prefab ? 'apoi-editing' : undefined}>
                      <td className="apoi-col-biome"><BiomeBubbles biomes={r.biomes} /></td>
                      <td className="apoi-col-thumb"><PreviewThumb row={r} onOpen={() => setPreview(r)} /></td>
                      <td>
                        <div className="apoi-type">
                          <code>{r.prefab}</code>
                          {r.overridden && <span className="apoi-tag" title="Has an admin override">edited</span>}
                        </div>
                        <div className="apoi-names">{r.name}</div>
                      </td>
                      <td className="apoi-muted">{r.type}</td>
                      <td>
                        <div className="apoi-vis">
                          <VisibilitySwitch row={r} run={run} />
                          <span className={`apoi-pill vis-${r.visibility}`}>{VIS_LABEL[r.visibility]}</span>
                        </div>
                        {r.visibility === 'partial' && (
                          <div className="apoi-count">{r.visible.toLocaleString()} / {r.total.toLocaleString()}</div>
                        )}
                      </td>
                      <td>
                        <div className="apoi-vis">
                          <span className={`apoi-pill icon-${r.iconStatus}`}>{ICON_LABEL[r.iconStatus]}</span>
                          <button
                            className="apoi-link"
                            aria-expanded={editing === r.prefab}
                            onClick={() => setEditing(e => (e === r.prefab ? null : r.prefab))}
                          >{editing === r.prefab ? 'Close' : 'Edit'}</button>
                        </div>
                        {r.icons.map(i => <IconSwatch key={i.icon + i.color} icon={i.icon} color={i.color} />)}
                      </td>
                      <td><LodPicker row={r} run={run} /></td>
                      <td className="apoi-num">{r.total.toLocaleString()}</td>
                    </tr>
                    {editing === r.prefab && (
                      <tr className="apoi-edit-row">
                        <td colSpan={COLUMNS}><PrefabEditor row={r} run={run} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={COLUMNS} className="apoi-muted">No prefabs match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <IconManager run={run} />
          <AdminPoiIconReport usage={iconUsage} />
          <PreviewDialog row={preview} onClose={() => setPreview(null)} />
        </>
      )}
    </div>
  );
};

export default AdminPois;
