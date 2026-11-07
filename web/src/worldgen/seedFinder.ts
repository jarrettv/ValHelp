// The seed finder (page /seeds, SeedFinder.tsx): what the page,
// its scanner (seedScanner.ts) and the worker (seedFinderWorker.ts) share.
// The boss pass itself is seedgen's BossScan (seedgen/Vh.WorldGen/Locations/BossScan.cs).

/** Characters after the prefix, as in fun0000000 … funZZZZZZZ. */
export const SEED_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Valheim's longest seed. */
export const SEED_LENGTH = 10;

/** How many seeds a prefix spans. */
export const seedSpace = (prefix: string) => SEED_ALPHABET.length ** (SEED_LENGTH - prefix.length);

/** The n-th seed for a prefix: the prefix, then n in base 36, zero-padded to 10 characters. */
export function seedName(prefix: string, n: number): string {
  const digits = new Array<string>(SEED_LENGTH - prefix.length);
  for (let i = digits.length - 1; i >= 0; i--) {
    digits[i] = SEED_ALPHABET[n % SEED_ALPHABET.length];
    n = Math.floor(n / SEED_ALPHABET.length);
  }
  return prefix + digits.join('');
}

/** The boss locations, in BossScan.Prefabs order (the worker checks it matches). */
export const BOSSES = [
  { prefab: 'Eikthyrnir', label: 'Eikthyr', color: '#a3d977' },
  { prefab: 'GDKing', label: 'The Elder', color: '#2fa37a' },
  { prefab: 'Bonemass', label: 'Bonemass', color: '#9aa63a' },
  { prefab: 'Dragonqueen', label: 'Moder', color: '#d8e6f2' },
  { prefab: 'GoblinKing', label: 'Yagluth', color: '#f0c75e' },
  { prefab: 'Mistlands_DvergrBossEntrance1', label: 'The Queen', color: '#4fb3d9' },
  { prefab: 'FaderLocation', label: 'Fader', color: '#ff6b4a' },
  { prefab: 'DN_Bossroom', label: 'Fimbulbringer', color: '#b39ddb' },
] as const;

/** Traders the second pass looks for, each near an altar (inside the corridor) of a boss. */
export const TRADERS = [
  { prefab: 'Vendor_BlackForest', label: 'Haldor', color: '#e0a060', boss: 'GDKing' },
  { prefab: 'BogWitch_Camp', label: 'Bog Witch', color: '#d070c0', boss: 'Bonemass' },
] as const;

/**
 * The search area: a band along the north-south axis (x = 0) through spawn,
 * pole to pole, half-width `center` metres at spawn widening linearly to `edge`
 * 10 km north or south; in the Deep North and Ash Lands it is `polar` instead
 * (BossScan's Corridor).
 */
export interface Corridor { center: number; edge: number; polar: number }
export const CORRIDOR_EDGE_DISTANCE = 10000;

/** The game's wobble on the Deep North and Ash Lands edges (WorldGenerator.WorldAngle * 100). */
export const polarWobble = (x: number, z: number) => 100 * Math.sin(Math.atan2(x, z) * 20);
/** WorldGenerator.IsDeepnorth / IsAshlands. */
export const isDeepNorth = (x: number, z: number) => Math.hypot(x, z + 4000) > 12000 + polarWobble(x, z);
export const isAshLands = (x: number, z: number) => Math.hypot(x, z - 4000) > 12000 + polarWobble(x, z);

/** Half-width of the linear band (outside the polar regions) at z. */
export const corridorHalfWidth = (c: Corridor, z: number) =>
  c.center + (c.edge - c.center) * Math.min(Math.abs(z), CORRIDOR_EDGE_DISTANCE) / CORRIDOR_EDGE_DISTANCE;

/** Half-width of the corridor at a point: the polar width in the Deep North and Ash Lands. */
export const corridorHalfWidthAt = (c: Corridor, x: number, z: number) =>
  isDeepNorth(x, z) || isAshLands(x, z) ? c.polar : corridorHalfWidth(c, z);

export const inCorridor = (c: Corridor, x: number, z: number) => Math.abs(x) <= corridorHalfWidthAt(c, x, z);

/** A placed boss altar or trader camp: prefab and world position (x east, z north). */
export type Altar = [prefab: string, x: number, z: number];

/** Per boss (BOSSES order): how far off the axis its most central altar inside the
 *  corridor is, as a fraction of the corridor's half-width there (0 = on the axis);
 *  null where it has none inside. */
export function bossOffsets(c: Corridor, altars: Altar[]): (number | null)[] {
  return BOSSES.map(b => {
    let best: number | null = null;
    for (const [prefab, x, z] of altars) {
      if (prefab !== b.prefab || !inCorridor(c, x, z)) continue;
      const f = Math.abs(x) / corridorHalfWidthAt(c, x, z);
      if (best === null || f < best) best = f;
    }
    return best;
  });
}

/** The closest trader camp to an altar of its boss inside the corridor. */
export interface TraderPair { distance: number; boss: [x: number, z: number]; trader: [x: number, z: number] }

/** Per trader (TRADERS order): its camp closest to one of its boss's altars inside the
 *  corridor, or null if the seed has no such pair. */
export function traderPairs(c: Corridor, altars: Altar[]): (TraderPair | null)[] {
  return TRADERS.map(t => {
    let best: TraderPair | null = null;
    for (const [bp, bx, bz] of altars) {
      if (bp !== t.boss || !inCorridor(c, bx, bz)) continue;
      for (const [tp, tx, tz] of altars) {
        if (tp !== t.prefab) continue;
        const distance = Math.hypot(tx - bx, tz - bz);
        if (!best || distance < best.distance) best = { distance, boss: [bx, bz], trader: [tx, tz] };
      }
    }
    return best;
  });
}

// ── Messages between seedScanner.ts and seedFinderWorker.ts ──────────────────

export type SeedFinderRequest =
  | { type: 'screen'; job: number; names: string[]; corridor: Corridor }
  | { type: 'exact'; job: number; name: string };

export type SeedFinderMessage =
  /** Each seed's estimated chance per boss (BOSSES order) of an altar in the corridor. */
  | { type: 'screened'; job: number; results: { name: string; chance: number[] }[]; ms: number }
  /** Every boss altar and trader camp the game places for the seed. */
  | { type: 'exact'; job: number; name: string; altars: Altar[]; ms: number }
  | { type: 'error'; job: number; message: string };
