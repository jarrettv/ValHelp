import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchVhItems, iconUrl } from '../guides/vh/data';
import type { VhItem } from '../guides/vh/types';

// The pieces of the game's inventory screen, shared by the runs list (RunCard)
// and a run's map page: health/stamina/eitr bars, food slots with the time
// left, the forsaken power as its boss's trophy, the inventory grid, and just
// the equipped items.

/** A character at one save (api CharEndpoints.LatestOut). */
export interface RunLatest {
  snapshotId: number; worldId: number | null; explored: number | null; x: number | null; z: number | null;
  health: number; maxHealth: number; stamina: number; maxStamina: number; eitr: number; maxEitr: number;
  guardianPower: string | null;
  inventoryRows: number;
  foods: { name: string; time: number }[];
  items: RunInvItem[];
}
export interface RunInvItem {
  name: string | null; prefabHash: number; stack: number; quality: number; gridX: number; gridY: number; equipped: boolean;
}

const COLS = 8;
// The playable world is a disc of radius 10 km; the explored map counts 12 m cells.
const WORLD_KM2 = Math.PI * 10 * 10;

/** Forsaken powers by the boss whose trophy grants them (shown as that trophy). */
const POWER_TROPHY: Record<string, { trophy: string; boss: string }> = {
  GP_Eikthyr: { trophy: 'TrophyEikthyr', boss: 'Eikthyr' },
  GP_TheElder: { trophy: 'TrophyTheElder', boss: 'The Elder' },
  GP_Bonemass: { trophy: 'TrophyBonemass', boss: 'Bonemass' },
  GP_Moder: { trophy: 'TrophyDragonQueen', boss: 'Moder' },
  GP_Yagluth: { trophy: 'TrophyGoblinKing', boss: 'Yagluth' },
  GP_Queen: { trophy: 'TrophySeekerQueen', boss: 'The Queen' },
  GP_Ashlands: { trophy: 'TrophyFader', boss: 'Fader' },
};

/** Equipped items in the order of the game's character slots. */
const SLOT_ORDER = ['OneHandedWeapon', 'TwoHandedWeapon', 'TwoHandedWeaponLeft', 'Bow', 'Torch', 'Tool', 'Shield',
  'Helmet', 'Chest', 'Legs', 'Shoulder', 'Utility', 'Trinket', 'Ammo'];

export function exploredKm2(cells: number | null | undefined): number | null {
  return cells != null ? cells * 144 / 1e6 : null;
}

export function pctOfWorld(km2: number): string {
  const pct = km2 / WORLD_KM2 * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 1)}% of the world`;
}

/** string.GetStableHashCode, as the game hashes prefab names (Vh.Character WorldFile.StableHash). */
export function stableHash(s: string): number {
  let h1 = 5381, h2 = 5381;
  for (let i = 0; i < s.length; i += 2) {
    h1 = (((h1 << 5) + h1) | 0) ^ s.charCodeAt(i);
    if (i + 1 < s.length) h2 = (((h2 << 5) + h2) | 0) ^ s.charCodeAt(i + 1);
  }
  return (h1 + Math.imul(h2, 1566083941)) | 0;
}

export type ItemIndex = ReturnType<typeof useItemIndex>;

/** Items by code and by prefab hash (1.0 saves keep only the hash). */
export function useItemIndex() {
  const { data } = useQuery({ queryKey: ['vh-items'], queryFn: fetchVhItems, staleTime: Infinity });
  return useMemo(() => {
    const byCode = new Map<string, VhItem>(), byHash = new Map<number, VhItem>();
    for (const it of data ?? []) { byCode.set(it.code, it); byHash.set(stableHash(it.code), it); }
    const of = (it: RunInvItem) => (it.name ? byCode.get(it.name) : byHash.get(it.prefabHash));
    return { byCode, byHash, of, ready: !!data };
  }, [data]);
}

export function Bars({ l }: { l: RunLatest }) {
  return (
    <>
      <Bar kind="hp" value={l.health} max={l.maxHealth} />
      <Bar kind="stam" value={l.stamina} max={l.maxStamina} />
      {l.maxEitr > 0 && <Bar kind="eitr" value={l.eitr} max={l.maxEitr} />}
    </>
  );
}

function Bar({ kind, value, max }: { kind: 'hp' | 'stam' | 'eitr'; value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const name = kind === 'hp' ? 'Health' : kind === 'stam' ? 'Stamina' : 'Eitr';
  return (
    <div className={`run-bar ${kind}`} title={`${name} ${Math.round(value)} / ${Math.round(max)}`}>
      <div style={{ width: `${pct}%` }} />
      <span>{Math.round(max)}</span>
    </div>
  );
}

/** The three food slots, then the forsaken power. */
export function Foods({ l, items }: { l: RunLatest; items: ItemIndex }) {
  return (
    <div className="run-foods">
      {[0, 1, 2].map(i => <FoodSlot key={i} food={l.foods[i]} item={l.foods[i] && items.byCode.get(l.foods[i].name)} />)}
      {l.guardianPower && <Power name={l.guardianPower} />}
    </div>
  );
}

function FoodSlot({ food, item }: { food?: { name: string; time: number }; item?: VhItem & { food?: { duration?: number } } }) {
  if (!food) return <div className="run-food empty" />;
  const duration = item?.food?.duration ?? 0;
  const left = duration > 0 ? Math.max(0, Math.min(1, food.time / duration)) : 1;
  return (
    <div className="run-food" title={`${item?.name ?? food.name}: ${Math.ceil(food.time / 60)} min left`}>
      {item?.hasIcon !== false ? <img src={iconUrl(food.name)} alt={item?.name ?? food.name} loading="lazy" />
        : <span className="run-slot-text">{food.name.slice(0, 4)}</span>}
      <div className="run-food-left" style={{ width: `${left * 100}%` }} />
    </div>
  );
}

function Power({ name }: { name: string }) {
  const p = POWER_TROPHY[name];
  const boss = p?.boss ?? name.replace(/^GP_/, '');
  return (
    <div className="run-gp" title={`Forsaken power: ${boss}`}>
      {p ? <img src={iconUrl(p.trophy)} alt={boss} loading="lazy" /> : <span className="run-slot-text">{boss}</span>}
    </div>
  );
}

/** One inventory slot's contents: icon (or a short name), stack, quality. */
function SlotContent({ it, items }: { it: RunInvItem; items: ItemIndex }) {
  const def = items.of(it);
  const code = def?.code ?? it.name;
  const label = def?.name ?? code ?? 'Unknown item';
  return (
    <>
      {code && def?.hasIcon !== false
        ? <img src={iconUrl(code)} alt={label} loading="lazy" />
        : <span className="run-slot-text">{label.slice(0, 4)}</span>}
      {it.stack > 1 && <span className="run-stack">{it.stack}</span>}
      {it.quality > 1 && <span className="run-quality">{it.quality}</span>}
    </>
  );
}

function itemLabel(it: RunInvItem, items: ItemIndex): string {
  const def = items.of(it);
  return def?.name ?? def?.code ?? it.name ?? 'Unknown item';
}

/** The inventory: 8 columns, as many rows as the player has, hotbar numbered, equipped lit. */
export function Inventory({ l, items, className }: { l: RunLatest; items: ItemIndex; className?: string }) {
  const rows = Math.max(1, l.inventoryRows ?? 4);
  const slots: (RunInvItem | undefined)[] = Array.from({ length: COLS * rows });
  for (const it of l.items) if (it.gridX < COLS && it.gridY < rows) slots[it.gridY * COLS + it.gridX] = it;
  return (
    <div className={`run-inv ${className ?? ''}`} aria-label="Inventory">
      {slots.map((it, i) => (
        <div key={i} className={`run-slot${it?.equipped ? ' equipped' : ''}`} title={it ? itemLabel(it, items) : undefined}>
          {i < COLS && <span className="run-hotkey">{i + 1}</span>}
          {it && <SlotContent it={it} items={items} />}
        </div>
      ))}
    </div>
  );
}

/** Only what the character wears and holds, in the game's slot order. */
export function Equipped({ l, items }: { l: RunLatest; items: ItemIndex }) {
  const rank = (it: RunInvItem) => {
    const i = SLOT_ORDER.indexOf(items.of(it)?.type ?? '');
    return i < 0 ? SLOT_ORDER.length : i;
  };
  const worn = l.items.filter(it => it.equipped).sort((a, b) => rank(a) - rank(b));
  if (worn.length === 0) return <div className="run-equipped empty">Nothing equipped</div>;
  return (
    <div className="run-equipped" aria-label="Equipped">
      {worn.map((it, i) => (
        <div key={i} className="run-slot equipped" title={itemLabel(it, items)}>
          <SlotContent it={it} items={items} />
        </div>
      ))}
    </div>
  );
}
