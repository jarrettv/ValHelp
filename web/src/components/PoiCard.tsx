import { useMemo } from 'react';
import { useVhItems } from '../guides/vh/data';
import type { PoiMarker } from './poiIcons';
import { placeCard } from './mapCard';
import './MapCard.css';
import './PoiCard.css';

// Card for a map POI: shown next to the cursor on hover, pinned where it was
// clicked. Everything a location holds (dungeon finds, chest loot, enemies) is
// an icon chip with a count, so the card stays small over the map.

/// Vegvisir location names (as the game stores them) → who they reveal.
const VEGVISIR_TARGETS: Record<string, string> = {
  Eikthyrnir: 'Eikthyr', GDKing: 'The Elder', Bonemass: 'Bonemass', Dragonqueen: 'Moder',
  GoblinKing: 'Yagluth', Mistlands_DvergrBossEntrance1: 'The Queen', FaderLocation: 'Fader',
};

/// Creatures the trophy data doesn't name (no trophy), plus spawner objects.
const CREATURE_NAMES: Record<string, string> = {
  Fish4_cave: 'Tetra', GoblinArcher: 'Fuling Archer', Spawner_Hole: 'Hole',
};

/// POI item names (seedgen's "Name xN" strings) that aren't plain item names → item codes for icons.
const FIND_ICONS: Record<string, string[]> = {
  'Black Core': ['BlackCore'],
  'Sealbreaker Fragment': ['DvergrKeyFragment'],
  'Crystal': ['Crystal'],
  'Fenris Claw/Hair': ['WolfClaw', 'WolfHairBundle'],
  'Troll': ['TrophyFrostTroll'],
  'GoblinTotem': ['GoblinTotem'],
  'Beehive': ['QueenBee'],
  'Maypole': ['piece_maypole'],
};

const icon = (code: string) => `/api/icon/${encodeURIComponent(code)}.png`;

function prettify(code: string): string {
  return code.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface Chip { codes: string[]; label: string; count?: number }

function ChipRow({ chips }: { chips: Chip[] }) {
  return (
    <div className="poi-card-chips">
      {chips.map((c, i) => (
        <span className="poi-card-chip" key={i} title={c.count && c.count > 1 ? `${c.label} ×${c.count}` : c.label}>
          {c.codes.length
            ? c.codes.map(code => (
                <img key={code} src={icon(code)} alt={c.label} loading="lazy"
                     onError={e => { e.currentTarget.style.display = 'none'; }} />
              ))
            : <span className="poi-card-chip-text">{c.label}</span>}
          {c.count != null && c.count > 1 && <span className="poi-card-count">×{c.count}</span>}
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

export default function PoiCard({ poi, x, y, width, height, pinned, onClose }: PoiCardProps) {
  const { data: items } = useVhItems();
  const byName = useMemo(() => new Map((items ?? []).map(i => [(i.name ?? '').toLowerCase(), i.code])), [items]);
  const names = useMemo(() => new Map((items ?? []).map(i => [i.code, i.name])), [items]);
  // Trophy data maps creature ids to their trophy and in-game name (ElakingMole → Eyeless One).
  const trophies = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const i of items ?? []) if (i.trophyDrop?.id) m.set(i.trophyDrop.id, { code: i.code, name: i.trophyDrop.creature ?? '' });
    return m;
  }, [items]);

  // "Black Core x4" → icon chip ×4; anything without a known icon stays text.
  const finds: Chip[] = (poi.items ?? []).map(s => {
    const m = /^(.*?)(?: x(\d+))?$/.exec(s)!;
    const name = m[1];
    const code = FIND_ICONS[name] ?? (byName.get(name.toLowerCase()) ? [byName.get(name.toLowerCase())!] : []);
    return { codes: code, label: name, count: m[2] ? Number(m[2]) : undefined };
  });

  const enemies: Chip[] = Object.entries(poi.creatures ?? {}).sort((a, b) => b[1] - a[1]).map(([code, n]) => {
    if (code.startsWith('spawner:')) {
      const id = code.slice(8);
      return { codes: [], label: `${CREATURE_NAMES[id] ?? prettify(id.replace(/^Spawner_/, ''))} spawner`, count: n };
    }
    const t = trophies.get(code);
    return { codes: t ? [t.code] : [], label: t?.name || CREATURE_NAMES[code] || prettify(code), count: n };
  });

  // A find that's also listed as an enemy (a troll cave's troll) shows once, as the enemy.
  const enemyCodes = new Set(enemies.flatMap(e => e.codes));
  const shownFinds = finds.filter(f => !f.codes.length || f.codes.some(c => !enemyCodes.has(c)));

  const chests = (poi.chests ?? []).map(chest =>
    chest.map(c => ({ codes: [c.item], label: names.get(c.item) ?? c.item, count: c.count })));

  const rows = (shownFinds.length ? 1 : 0) + (enemies.length ? 1 : 0) + chests.length + (poi.vegvisirs?.length ? 1 : 0);
  const style = placeCard(x, y, 40 + rows * 34, width, height);

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
      {shownFinds.length > 0 && <ChipRow chips={shownFinds} />}
      {poi.vegvisirs && poi.vegvisirs.length > 0 && (
        <div className="poi-card-vegvisir">Vegvisir → {poi.vegvisirs.map(v => VEGVISIR_TARGETS[v] ?? v).join(', ')}</div>
      )}
      {enemies.length > 0 && (
        <div className="poi-card-section">
          <div className="map-card-label">Enemies</div>
          <ChipRow chips={enemies} />
        </div>
      )}
      {chests.map((chips, i) => (
        <div className="poi-card-section" key={i}>
          <div className="map-card-label">{chests.length > 1 ? `Chest ${i + 1}/${chests.length}` : 'Chest'}</div>
          <ChipRow chips={chips} />
        </div>
      ))}
    </aside>
  );
}
