import { useMemo, useState } from 'react';
import { useVhItems } from './guides/vh/data';
import { getPoiConfig, setPoiConfig, usePoiConfigVersion } from './components/poiIcons';
import {
  creatureIcon, defaultContentStarred, defaultContentVisible, itemKey, KIND_LABELS, possibleContents, starKey, usePoiContents,
  VEGVISIR_KEY, type ContentKind, type ContentObject, type PoiContentsCatalog,
} from './components/poiContents';

// Admin: what one location's POI card shows. Lists every entry the location can
// hold (from the contents catalogue): its chests (and each item they can roll),
// enemies, finds, vegvisir. Each one is shown or hidden for this location, for
// every location ("*"), or left to the code default (poiContents.ts).
// Starring an entry the same way makes it adorn the map icon at the deepest
// zooms (poiAdorn.ts); stars are saved as "star:<entry>".

type Choice = 'default' | 'here-on' | 'here-off' | 'all-on' | 'all-off';

/// Show/hide one card entry for a location prefab ("*": every location). Null clears it.
async function saveContent(prefab: string, key: string, visible: boolean | null) {
  const r = await fetch('/api/admin/poi/contents', {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefab, key, visible }),
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  const cfg = getPoiConfig();
  const contents = { ...cfg.contents, [prefab]: { ...cfg.contents[prefab] } };
  if (visible == null) delete contents[prefab][key];
  else contents[prefab][key] = visible;
  if (!Object.keys(contents[prefab]).length) delete contents[prefab];
  setPoiConfig({ ...cfg, contents });
}

function currentChoice(prefab: string, key: string): Choice {
  const cfg = getPoiConfig().contents;
  const here = cfg[prefab]?.[key];
  if (here != null) return here ? 'here-on' : 'here-off';
  const all = cfg['*']?.[key];
  if (all != null) return all ? 'all-on' : 'all-off';
  return 'default';
}

async function applyChoice(prefab: string, key: string, from: Choice, to: Choice) {
  if (from === to) return;
  // Leaving "everywhere" clears the all-locations override; leaving "here" clears this one.
  if (from.startsWith('all') && !to.startsWith('all')) await saveContent('*', key, null);
  if (from.startsWith('here') && !to.startsWith('here')) await saveContent(prefab, key, null);
  if (to === 'here-on' || to === 'here-off') await saveContent(prefab, key, to === 'here-on');
  if (to === 'all-on' || to === 'all-off') await saveContent('*', key, to === 'all-on');
}

function ChoiceSelect({ prefab, k, cat, run, chance }: {
  prefab: string; k: string; cat: PoiContentsCatalog | null; run: (f: () => Promise<void>) => void; chance?: number;
}) {
  const value = currentChoice(prefab, k);
  const def = defaultContentVisible(k, cat, chance);
  return (
    <select className={`apoi-card-choice ${value === 'default' ? '' : 'set'}`} value={value}
            aria-label={`Show ${k} on the card`}
            onChange={e => run(() => applyChoice(prefab, k, value, e.target.value as Choice))}>
      <option value="default">Default ({def ? 'shown' : 'hidden'})</option>
      <option value="here-on">Show here</option>
      <option value="here-off">Hide here</option>
      <option value="all-on">Show everywhere</option>
      <option value="all-off">Hide everywhere</option>
    </select>
  );
}

/// Star an entry: it adorns the location's map icon at the deepest zooms.
function StarSelect({ prefab, k, run }: { prefab: string; k: string; run: (f: () => Promise<void>) => void }) {
  const sk = starKey(k);
  const value = currentChoice(prefab, sk);
  const def = defaultContentStarred(k);
  const on = value === 'default' ? def : value.endsWith('-on');
  return (
    <select className={`apoi-card-choice apoi-card-star ${value === 'default' ? '' : 'set'} ${on ? 'on' : ''}`}
            value={value} aria-label={`Star ${k} (map adornment)`}
            title={on ? 'Starred: adorns the map icon up close' : 'Not starred'}
            onChange={e => run(() => applyChoice(prefab, sk, value, e.target.value as Choice))}>
      <option value="default">{def ? '★' : '☆'} Default</option>
      <option value="here-on">★ Star here</option>
      <option value="here-off">☆ Unstar here</option>
      <option value="all-on">★ Star everywhere</option>
      <option value="all-off">☆ Unstar everywhere</option>
    </select>
  );
}

const KIND_ORDER: ContentKind[] = ['chest', 'pickup', 'item', 'beehive', 'smash', 'enemy', 'spawner'];
const icon = (code: string) => `/api/icon/${encodeURIComponent(code)}.png`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function hasCardContents(prefab: string, cat: PoiContentsCatalog | null): boolean {
  const p = possibleContents(prefab, cat);
  return Object.keys(p.objects).some(k => cat?.objects[k]) || p.vegvisirs.length > 0;
}

export function CardContentsEditor({ prefab, run }: { prefab: string; run: (f: () => Promise<void>) => void }) {
  usePoiConfigVersion();
  const cat = usePoiContents();
  const { data: items } = useVhItems();
  const [open, setOpen] = useState<string | null>(null);
  const names = useMemo(() => new Map((items ?? []).map(i => [i.code, i.name])), [items]);
  const trophy = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items ?? []) if (i.trophyDrop?.id) m.set(i.trophyDrop.id, i.code);
    return m;
  }, [items]);
  if (!cat) return <div className="apoi-muted">Loading contents…</div>;

  const possible = possibleContents(prefab, cat);
  const itemName = (c: string) => names.get(c) ?? cat.names[c] ?? c;
  const entries = Object.entries(possible.objects)
    .map(([p, o]) => ({ p, o, obj: cat.objects[p] }))
    .filter((e): e is { p: string; o: { max: number | null; chance: number }; obj: ContentObject } => !!e.obj)
    .sort((a, b) => KIND_ORDER.indexOf(a.obj.kind) - KIND_ORDER.indexOf(b.obj.kind) || a.obj.name.localeCompare(b.obj.name));

  const iconsOf = (obj: ContentObject): string[] => {
    if (obj.kind === 'enemy') { const ic = creatureIcon(obj.creature, trophy); return ic ? [ic] : []; }
    if (obj.kind === 'spawner') return (obj.creatures ?? []).map(c => creatureIcon(c.creature, trophy)).filter((c): c is string => !!c).slice(0, 3);
    if (obj.items) return obj.items.slice(0, 4).map(i => i.item);
    if (obj.table) return obj.table.items.slice(0, 3).map(i => i.item);
    return obj.item ? [obj.item] : [];
  };
  const detail = (obj: ContentObject, o: { max: number | null; chance: number }) => [
    o.max == null ? 'in some rooms' : o.chance < 0.995 ? `up to ${o.max}, ${pct(o.chance)} each` : `${o.max}`,
    obj.table ? `${obj.table.rolls[0]}-${obj.table.rolls[1]} rolls` : '',
    obj.kind === 'spawner' ? (obj.creatures ?? []).map(c => cat.names[c.creature] ?? c.creature).join(', ') : '',
    obj.kind === 'pickup' && (obj.items?.length ?? 0) > 1 ? obj.items!.map(i => itemName(i.item)).join(', ') : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="apoi-card-editor">
      <p className="apoi-sub">
        What this location&apos;s card can show. <strong>Here</strong> applies to <code>{prefab}</code> only;
        <strong> everywhere</strong> to every location that has it (this location&apos;s own choice wins).
        <strong> ★ Starred</strong> entries also adorn the map icon over the last zoom steps.
      </p>
      <table className="apoi-table apoi-card-table">
        <tbody>
          {possible.vegvisirs.length > 0 && (
            <tr>
              <td className="apoi-muted">Vegvisir</td>
              <td><img className="apoi-card-icon" src="/img/Poi/vegvisir.svg" alt="" /> {possible.vegvisirs.join(', ')}</td>
              <td />
              <td><ChoiceSelect prefab={prefab} k={VEGVISIR_KEY} cat={cat} run={run} /></td>
              <td><StarSelect prefab={prefab} k={VEGVISIR_KEY} run={run} /></td>
            </tr>
          )}
          {entries.map(({ p, o, obj }) => (
            <CardRow key={p} {...{ p, o, obj, prefab, cat, run }} icons={iconsOf(obj)} detail={detail(obj, o)}
                     open={open === p} onToggle={() => setOpen(x => (x === p ? null : p))} itemName={itemName} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardRow({ p, obj, prefab, cat, run, icons, detail, open, onToggle, itemName }: {
  p: string; o: { max: number | null; chance: number }; obj: ContentObject; prefab: string;
  cat: PoiContentsCatalog; run: (f: () => Promise<void>) => void; icons: string[]; detail: string;
  open: boolean; onToggle: () => void; itemName: (c: string) => string;
}) {
  const items = obj.kind === 'chest' ? obj.table?.items ?? [] : [];
  return (
    <>
      <tr>
        <td className="apoi-muted">{KIND_LABELS[obj.kind]}</td>
        <td>
          {icons.map(c => <img key={c} className="apoi-card-icon" src={icon(c)} alt="" loading="lazy"
                               onError={e => { e.currentTarget.style.display = 'none'; }} />)}
          {' '}{obj.name} <code className="apoi-card-prefab">{p}</code>
          {items.length > 0 && (
            <button className="apoi-link apoi-card-items-toggle" aria-expanded={open} onClick={onToggle}>
              {open ? 'Hide items' : `${items.length} items`}
            </button>
          )}
        </td>
        <td className="apoi-muted">{detail}</td>
        <td><ChoiceSelect prefab={prefab} k={p} cat={cat} run={run} /></td>
        <td><StarSelect prefab={prefab} k={p} run={run} /></td>
      </tr>
      {open && items.map(i => (
        <tr key={i.item} className="apoi-card-item">
          <td />
          <td>
            <img className="apoi-card-icon" src={icon(i.item)} alt="" loading="lazy" /> {itemName(i.item)}
            {' '}<span className="apoi-muted">{i.min === i.max ? i.min : `${i.min}-${i.max}`}</span>
          </td>
          <td className="apoi-muted">{pct(i.chance)} of chests</td>
          <td><ChoiceSelect prefab={prefab} k={itemKey(i.item)} cat={cat} run={run} chance={i.chance} /></td>
          <td><StarSelect prefab={prefab} k={itemKey(i.item)} run={run} /></td>
        </tr>
      ))}
    </>
  );
}
