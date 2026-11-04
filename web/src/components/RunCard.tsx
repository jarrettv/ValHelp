import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchVhItems, iconUrl } from '../guides/vh/data';
import type { VhItem } from '../guides/vh/types';
import { formatPlay } from './CharTimeline';
import { mapThumb } from './mapThumb';

// One run in the runs list, laid out like the game's inventory screen: health,
// stamina and eitr bars, the three food slots with the time left on each, and
// the 8 x 4 inventory with equipped items lit and the hotbar numbered; beside it
// the world as explored so far.

export interface RunLatest {
  snapshotId: number; worldId: number | null; explored: number | null; x: number | null; z: number | null;
  health: number; maxHealth: number; stamina: number; maxStamina: number; eitr: number; maxEitr: number;
  guardianPower: string | null;
  inventoryRows: number;
  foods: { name: string; time: number }[];
  items: { name: string | null; prefabHash: number; stack: number; quality: number; gridX: number; gridY: number; equipped: boolean }[];
}
export interface RunItem {
  id: number; name: string; latestFileTime: string; snapshots: number; sessions: number; playSeconds: number;
  worlds: { id: number; name: string | null; seed: string | null; needsSeed: boolean }[];
  latest: RunLatest | null;
}

// The inventory is 8 x 4; the traders' pocket upgrades add rows (to 6), shown locked until bought.
const COLS = 8, MIN_ROWS = 6, THUMB = 148;
// The playable world is a disc of radius 10 km; the explored map counts 12 m cells.
const WORLD_KM2 = Math.PI * 10 * 10;

function pctOfWorld(km2: number): string {
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

/** Items by code and by prefab hash (1.0 saves keep only the hash). */
function useItemIndex() {
  const { data } = useQuery({ queryKey: ['vh-items'], queryFn: fetchVhItems, staleTime: Infinity });
  return useMemo(() => {
    const byCode = new Map<string, VhItem>(), byHash = new Map<number, VhItem>();
    for (const it of data ?? []) { byCode.set(it.code, it); byHash.set(stableHash(it.code), it); }
    return { byCode, byHash, ready: !!data };
  }, [data]);
}

export default function RunCard({ run }: { run: RunItem }) {
  const items = useItemIndex();
  const l = run.latest;
  const world = run.worlds.find(w => w.id === l?.worldId) ?? run.worlds[0];
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!l || !world?.seed || l.worldId == null) { setThumb(null); return; }
    let alive = true;
    mapThumb({
      characterId: run.id, worldId: l.worldId, seed: world.seed, snapshotId: l.snapshotId,
      at: l.x != null && l.z != null ? { x: l.x, z: l.z } : null, size: THUMB,
    }).then(url => { if (alive) setThumb(url); });
    return () => { alive = false; };
  }, [run.id, l, world?.seed]);

  const km2 = l?.explored != null ? l.explored * 144 / 1e6 : null;
  const rows = l?.inventoryRows ?? 4, shownRows = Math.max(MIN_ROWS, rows);
  const slots: (RunLatest['items'][number] | undefined)[] = Array.from({ length: COLS * shownRows });
  for (const it of l?.items ?? []) if (it.gridX < COLS && it.gridY < shownRows) slots[it.gridY * COLS + it.gridX] = it;

  return (
    <Link to={`/runs/${run.id}${world ? `?world=${world.id}` : ''}`} className="run-card">
      <div className="run-thumb" style={{ width: THUMB, height: THUMB }}>
        {thumb ? <img src={thumb} alt={`${run.name}'s explored map`} width={THUMB} height={THUMB} />
          : <span>{thumb === undefined ? 'Loading map…' : world?.needsSeed ? 'Seed unknown' : 'No map yet'}</span>}
      </div>

      <div className="run-info">
        <div className="run-name">{run.name}</div>
        <div className="run-meta">
          <span>{world?.name ?? 'Unnamed world'}</span>
          <span>{formatPlay(run.playSeconds)} played</span>
          {km2 != null && <span>{km2.toFixed(1)} km² explored ({pctOfWorld(km2)})</span>}
          <span>{run.sessions} session{run.sessions === 1 ? '' : 's'}</span>
        </div>
        {l && (
          <>
            <Bar kind="hp" value={l.health} max={l.maxHealth} />
            <Bar kind="stam" value={l.stamina} max={l.maxStamina} />
            {l.maxEitr > 0 && <Bar kind="eitr" value={l.eitr} max={l.maxEitr} />}
            <div className="run-foods">
              {[0, 1, 2].map(i => <FoodSlot key={i} food={l.foods[i]} item={l.foods[i] && items.byCode.get(l.foods[i].name)} />)}
              {l.guardianPower && <span className="run-gp" title="Forsaken power">{l.guardianPower.replace(/^GP_/, '')}</span>}
            </div>
          </>
        )}
      </div>

      <div className="run-inv" aria-label="Inventory">
        {slots.map((it, i) => {
          const def = it && (it.name ? items.byCode.get(it.name) : items.byHash.get(it.prefabHash));
          const code = def?.code ?? it?.name;
          const label = def?.name ?? code ?? (it ? 'Unknown item' : '');
          const locked = Math.floor(i / COLS) >= rows;
          return (
            <div key={i} className={`run-slot${it?.equipped ? ' equipped' : ''}${locked ? ' locked' : ''}`}
              title={it ? label : locked ? 'Locked: more pockets are sold by traders' : undefined}>
              {i < COLS && <span className="run-hotkey">{i + 1}</span>}
              {it && (code && def?.hasIcon !== false
                ? <img src={iconUrl(code)} alt={label} loading="lazy" />
                : <span className="run-slot-text">{label.slice(0, 4)}</span>)}
              {it && it.stack > 1 && <span className="run-stack">{it.stack}</span>}
              {it && it.quality > 1 && <span className="run-quality">{it.quality}</span>}
            </div>
          );
        })}
      </div>
    </Link>
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
