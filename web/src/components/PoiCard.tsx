import { useMemo } from 'react';
import { useVhItems } from '../guides/vh/data';
import { poiIconSrc, usePoiConfigVersion, type PoiMarker } from './poiIcons';
import {
  contentVisible, creatureIcon, itemKey, possibleContents, usePoiContents, VEGVISIR_KEY,
  type ContentObject, type PoiContentsCatalog,
} from './poiContents';
import { placeCard } from './mapCard';
import './MapCard.css';
import './PoiCard.css';

// Card for a map POI: shown next to the cursor on hover, pinned where it was
// clicked. Every location gets the same sections, each an icon chip row:
//   finds    pickups, loose items, beehives, smashable loot, vegvisirs, and the
//            camp pieces mapped on their own (maypole, granary)
//   chests   as the game rolled them when seedgen has that, otherwise each
//            chest's rolls and the chance of each item
//   enemies  creature spawners and spawner objects (nests, bone piles)
// Seedgen's simulation says what an instance holds (poi.contents); where it has
// none, the card lists what the location can hold. The admin page picks which
// entries show (poiContents.ts).

/// Vegvisir location names (as the game stores them) → who they reveal.
const VEGVISIR_TARGETS: Record<string, string> = {
  Eikthyrnir: 'Eikthyr', GDKing: 'The Elder', Bonemass: 'Bonemass', Dragonqueen: 'Moder',
  GoblinKing: 'Yagluth', Mistlands_DvergrBossEntrance1: 'The Queen', FaderLocation: 'Fader',
  DN_Bossroom: 'Morkhalla boss',
};

/// Camp pieces seedgen maps as POIs of their own, listed in their camp's items.
const MARK_ITEMS: Record<string, { codes?: string[]; icon?: string }> = {
  Maypole: { codes: ['piece_maypole'] },
  Granary: { icon: 'granary' },
};

const icon = (code: string) => `/api/icon/${encodeURIComponent(code)}.png`;
const pct = (p: number) => (p >= 0.995 ? '' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);

function prettify(code: string): string {
  return code.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/// codes: item icons; src: other art (a map icon); note: gold text after the
/// icon; sub: grey text (a chance, a range).
interface Chip { codes: string[]; label: string; count?: number; src?: string; note?: string; sub?: string }

function ChipRow({ chips }: { chips: Chip[] }) {
  return (
    <div className="poi-card-chips">
      {chips.map((c, i) => (
        <span className="poi-card-chip" key={i}
              title={[c.label, c.count && c.count > 1 ? `×${c.count}` : '', c.sub ?? ''].filter(Boolean).join(' ')}>
          {c.src && <img src={c.src} alt={c.label} />}
          {!c.src && c.codes.map(code => (
            <img key={code} src={icon(code)} alt={c.label} loading="lazy"
                 onError={e => { e.currentTarget.style.display = 'none'; }} />
          ))}
          {!c.src && !c.codes.length && !c.note && <span className="poi-card-chip-text">{c.label}</span>}
          {c.note && <span className="poi-card-chip-note">{c.note}</span>}
          {c.count != null && c.count > 1 && <span className="poi-card-count">×{c.count}</span>}
          {c.sub && <span className="poi-card-chip-sub">{c.sub}</span>}
        </span>
      ))}
    </div>
  );
}

interface PoiCardProps {
  poi: PoiMarker;
  x: number;          // where to anchor it, in the map's own pixels
  y: number;
  width: number;      // map size, to keep the card inside it
  height: number;
  pinned?: boolean;   // takes clicks; click it to close
  onClose?: () => void;
}

interface Section { label?: string; chips: Chip[] }

export default function PoiCard({ poi, x, y, width, height, pinned, onClose }: PoiCardProps) {
  const { data: items } = useVhItems();
  const cat = usePoiContents();
  usePoiConfigVersion();   // admin show/hide changes re-render the card
  const names = useMemo(() => new Map((items ?? []).map(i => [i.code, i.name])), [items]);
  // Trophy data maps creature ids to their trophy and in-game name (ElakingMole → Eyeless One).
  const trophies = useMemo(() => {
    const codes = new Map<string, string>(), names = new Map<string, string>();
    for (const i of items ?? []) if (i.trophyDrop?.id) {
      codes.set(i.trophyDrop.id, i.code);
      names.set(i.trophyDrop.id, i.trophyDrop.creature ?? '');
    }
    return { codes, names };
  }, [items]);

  const sections = buildSections(poi, cat, {
    itemName: code => names.get(code) ?? cat?.names[code] ?? prettify(code),
    creature: code => {
      const ic = creatureIcon(code, trophies.codes);
      return { codes: ic ? [ic] : [], name: trophies.names.get(code) || cat?.names[code] || prettify(code) };
    },
  });

  const style = placeCard(x, y, 40 + sections.length * 34, width, height);

  return (
    <aside className={`map-card poi-card${pinned ? ' pinned' : ''}`} style={style}
           role={pinned ? 'dialog' : 'tooltip'} onClick={pinned ? onClose : undefined}
           title={pinned ? 'Click to close' : undefined}>
      <div className="poi-card-head">
        <span className="poi-card-name">{poi.name}</span>
        <span className="poi-card-coords">{poi.x.toFixed(0)}, {poi.z.toFixed(0)}</span>
      </div>
      {(poi.type !== poi.name || (poi.prefab && poi.prefab !== poi.name)) && (
        <div className="poi-card-meta">{poi.type}{poi.prefab && poi.prefab !== poi.name ? ` · ${poi.prefab}` : ''}</div>
      )}
      {sections.map((s, i) => s.label
        ? (
          <div className="poi-card-section" key={i}>
            <div className="map-card-label">{s.label}</div>
            <ChipRow chips={s.chips} />
          </div>
        )
        : <ChipRow key={i} chips={s.chips} />)}
    </aside>
  );
}

interface Namers {
  itemName: (code: string) => string;
  creature: (code: string) => { codes: string[]; name: string };
}

/// The card's rows for one POI, honouring the admin's show/hide choices.
function buildSections(poi: PoiMarker, cat: PoiContentsCatalog | null, n: Namers): Section[] {
  const prefab = poi.prefab;
  const shown = (key: string, chance?: number) => contentVisible(prefab, key, cat, chance);
  const finds: Chip[] = [];
  const enemies: Chip[] = [];
  const chestRows: Section[] = [];

  for (const it of poi.items ?? []) {
    const m = MARK_ITEMS[it];
    if (m) finds.push({ codes: m.codes ?? [], src: m.icon ? poiIconSrc(m.icon) : undefined, label: it });
  }

  if (shown(VEGVISIR_KEY)) {
    for (const v of poi.vegvisirs ?? []) {
      const target = VEGVISIR_TARGETS[v] ?? prettify(v);
      finds.push({ codes: [], src: poiIconSrc('vegvisir'), label: `Vegvisir → ${target}`, note: target });
    }
  }

  // Seedgen's count of each object, or (not simulated) everything the location can hold.
  const simulated = poi.contents != null;
  const possible = simulated ? null : possibleContents(prefab, cat);
  const entries: [string, number, string | undefined][] = simulated
    ? Object.entries(poi.contents!).map(([p, c]) => [p, c, undefined])
    : Object.entries(possible!.objects).map(([p, o]) =>
        [p, o.max ?? 1, o.max == null ? 'maybe' : o.chance < 0.995 ? `up to ${o.max}, ${pct(o.chance)} each` : undefined]);
  if (possible && shown(VEGVISIR_KEY) && !poi.vegvisirs?.length) {
    for (const v of possible.vegvisirs) {
      const target = VEGVISIR_TARGETS[v] ?? prettify(v);
      finds.push({ codes: [], src: poiIconSrc('vegvisir'), label: `Vegvisir → ${target} (maybe)`, note: target, sub: 'maybe' });
    }
  }

  for (const [p, count, sub] of entries.sort((a, b) => b[1] - a[1])) {
    const obj: ContentObject | undefined = cat?.objects[p];
    if (!obj || !shown(p)) continue;
    const c = simulated ? count : undefined;
    switch (obj.kind) {
      case 'enemy': {
        const cr = n.creature(obj.creature!);
        const stars = obj.levels && obj.levels[1] > 1 ? `★0-${obj.levels[1] - 1}` : undefined;
        enemies.push({ codes: cr.codes, label: cr.name, count: c, sub: [sub, stars].filter(Boolean).join(' ') || undefined });
        break;
      }
      case 'spawner': {
        const codes = (obj.creatures ?? []).flatMap(s => n.creature(s.creature).codes).slice(0, 3);
        enemies.push({ codes, label: `${obj.name}: ${(obj.creatures ?? []).map(s => n.creature(s.creature).name).join(', ')}`,
                       count: c, sub });
        break;
      }
      case 'chest':
        // Chests the game rolled are listed below as they are.
        if (!poi.chests?.length) chestRows.push(chestOdds(obj, c, sub, shown, n));
        break;
      case 'pickup': {
        const its = obj.items ?? [];
        finds.push({ codes: its.slice(0, 4).map(i => i.item), count: c, sub,
                     label: its.length > 1 ? `${obj.name}: ${its.map(i => n.itemName(i.item)).join(', ')}` : obj.name });
        break;
      }
      case 'item':
      case 'beehive':
        finds.push({ codes: obj.item ? [obj.item] : [], label: obj.name, count: c, sub });
        break;
      case 'smash': {
        const its = obj.table?.items ?? (obj.item ? [{ item: obj.item }] : []);
        const drops = its.map(i => n.itemName(i.item)).join(', ');
        finds.push({ codes: its.slice(0, 3).map(i => i.item), count: c, sub,
                     label: drops === obj.name ? `${obj.name} (smash)` : `${obj.name} (smash): ${drops}` });
        break;
      }
    }
  }

  // Rolled chests carry no prefab: hide them when every chest the location has is hidden.
  const chestPrefabs = entries.map(e => e[0]).filter(p => cat?.objects[p]?.kind === 'chest');
  const chestsShown = !chestPrefabs.length || chestPrefabs.some(shown);
  const exact = (chestsShown ? poi.chests ?? [] : []).map((chest, i, all): Section => ({
    label: all.length > 1 ? `Chest ${i + 1}/${all.length}` : 'Chest',
    chips: chest.filter(it => shown(itemKey(it.item)))
      .map(it => ({ codes: [it.item], label: n.itemName(it.item), count: it.count })),
  })).filter(s => s.chips.length);

  const out: Section[] = [];
  if (finds.length) out.push({ chips: finds });
  out.push(...exact, ...chestRows.filter(s => s.chips.length));
  if (enemies.length) out.push({ label: 'Enemies', chips: enemies });
  return out;
}

/// A chest whose contents seedgen can't know: its rolls and each item's chance.
function chestOdds(obj: ContentObject, count: number | undefined, sub: string | undefined,
                   shown: (key: string, chance?: number) => boolean, n: Namers): Section {
  const t = obj.table;
  const rolls = t ? (t.rolls[0] === t.rolls[1] ? `${t.rolls[0]}` : `${t.rolls[0]}-${t.rolls[1]}`) : '';
  const label = [
    `${obj.name}${count && count > 1 ? ` ×${count}` : ''}`,
    t ? `${rolls} roll${rolls === '1' ? '' : 's'}${t.chance < 0.995 ? `, ${pct(t.chance)} not empty` : ''}` : '',
    sub ?? '',
  ].filter(Boolean).join(' · ');
  return {
    label,
    chips: (t?.items ?? []).filter(i => shown(itemKey(i.item), i.chance)).map(i => ({
      codes: [i.item],
      label: `${n.itemName(i.item)} ${i.min === i.max ? i.min : `${i.min}-${i.max}`}`,
      sub: pct(i.chance) || undefined,
    })),
  };
}
