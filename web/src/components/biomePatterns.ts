// Map patterns for biome variants (the game's alt biomes, see BIOME_VARIANTS.md).
//
// The map outlines each variant sector with a heavy stroke in its variant's
// tint; a sector carrying several variants gets one more stroke inside per
// extra variant (up to three), the most important outermost (STROKE_PRIORITY
// below). (vector-map.js still has the
// older look, a tint wash plus up to three interleaved patterns, behind
// VARIANT_STYLE.)
//
// seedgen saves, per seed, the variant sectors the game placed
// (`/api/worlds/<seed>/altbiomes`) and a 2048x2048 grid of which sector each
// minimap cell is in (`/altbiomegrid`, gzipped). Every variant listed below gets
// its tint as a stroke around its sectors (vector-map.js renderPatterns).
// Admins can recolour or hide any variant on /auth/pois (PoiConfig.altBiomes),
// including ones without a line here, which then get a stroke too.
//
// Adding one: draw a square tile in public/img/Patterns/<pattern>.svg (keep its
// shapes inside the tile with a margin, since it repeats edge to edge), then add
// its line here. Variant names are the game's (`AltBiome.m_name`).

import { getPoiConfig } from './poiIcons';

export interface BiomePattern {
  pattern?: string;  // file stem under /img/Patterns; none = tint only
  tint: string;      // #rrggbb stroke colour (and the wash under the pattern, in the pattern look)
  label: string;
  /// How sparse: the SVG's viewBox is 128 × spread units square (1 or 2), and
  /// it repeats over spread × spread the usual area, so its shapes come out the
  /// same size on screen with 1/spread² the density. Default 1.
  spread?: number;
}

export const BIOME_PATTERNS: Record<string, BiomePattern> = {
  Mushroom: { pattern: 'mushroom', tint: '#c0392b', label: 'Mushrooms' },
  'Root Black Forest': { pattern: 'root', tint: '#b07a3e', label: 'Roots', spread: 2 },
  'Bog Swamp': { pattern: 'abomination', tint: '#9c9188', label: 'Bog', spread: 2 },   // light cold taupe: green read as forest, a dark brown vanishes on swamp
  'Abomination Swamp': { pattern: 'abomination', tint: '#9c9188', label: 'Abominations', spread: 2 },
  'Dandelion Meadows': { pattern: 'dandelion', tint: '#e8c43a', label: 'Dandelions' },
  'Raspberry Meadows': { pattern: 'raspberry', tint: '#c8314a', label: 'Raspberries' },
  'Blueberry Black Forest': { pattern: 'blueberry', tint: '#4a62c8', label: 'Blueberries' },
  Bones: { pattern: 'bones', tint: '#d8d0b8', label: 'Bones', spread: 2 },
  Menhir: { pattern: 'menhir', tint: '#9aa0a8', label: 'Menhirs', spread: 2 },
  'Swords Mistlands': { pattern: 'swords', tint: '#c4562a', label: 'Giant swords', spread: 2 },
  'Birch Meadows': { pattern: 'birch', tint: '#e6ecd0', label: 'Birches' },
  'Pinetree Black Forest': { pattern: 'pinetree', tint: '#1f4a2c', label: 'Pines' },
  'Smalltree Meadows': { pattern: 'smalltree', tint: '#8cc04a', label: 'Small trees' },
  'Kalhygge Black Forest': { pattern: 'stumps', tint: '#c9a06a', label: 'Clear-cut' },
  'Rock Black Forest': { pattern: 'boulders', tint: '#8a8e96', label: 'Boulders' },
  'Trees Mistlands': { pattern: 'yggashoots', tint: '#c48ad0', label: 'Ygga shoots', spread: 2 },
  'Peaceful Meadows': { pattern: 'fireflies', tint: '#e6ff7a', label: 'Fireflies' },
  // Tint only: these change what spawns (or remove things), nothing to draw.
  'Troll Black Forest': { tint: '#3d6fa0', label: 'Trolls' },
  'Bat Swamp': { tint: '#5a4a6e', label: 'Bats' },
  'Wolf Mountain': { tint: '#6e7888', label: 'Wolves' },
  'Drake Mountain': { tint: '#7fb0d8', label: 'Drakes' },
  'Lox Plains': { tint: '#8a6a4a', label: 'Lox' },
  'Hare Mistlands': { tint: '#c0b0d0', label: 'Hares' },
  'BroodSwarm Mistlands': { tint: '#7a4a9a', label: 'Seeker broods' },
  'Rockless Mistlands': { tint: '#e0d8ec', label: 'Open Mistlands' },
};

const PATTERN_BASE = '/img/Patterns/';
const SLOT_PX = 256;   // atlas resolution per pattern tile (a spread-2 tile still gets 1 px per unit)

export interface AltSector { biome: string; alts: string[] }

export interface PatternOverlay {
  grid: Uint8Array;
  size: number;
  lut: Uint8Array;
  atlas: HTMLCanvasElement;
  cols: number;   // atlas grid: slot n is at column (n-1) % cols, row (n-1) / cols
  rows: number;
  /// Stroke colours, RGBA 256x4: row k, entry n is sector n's (k+1)th variant's
  /// colour, alpha 255, or all 0 past its last variant.
  strokeLut: Uint8Array;
  /// Atlas slot (1-based) of every pattern this seed uses, hidden or not, so a
  /// config change only rebuilds the LUTs (variantLuts).
  slotOf: Map<string, number>;
  /// The seed's variant sectors; a grid cell's value n (1-based) is sectors[n - 1].
  sectors: AltSector[];
}

/// Most strokes drawn around one sector: its first three variants.
const MAX_STROKES = 3;

/// Which of a sector's variants gets the outer ring: earlier here is further out
/// (and higher in the hover card). Variants only share a sector within one biome,
/// so only the order inside each biome's group matters: what changes how the
/// area plays (new enemies, ruins, the whole landscape) beats a change of
/// creatures or plants. Unlisted variants go innermost, in the game's order.
const STROKE_PRIORITY: readonly string[] = [
  // Meadows
  'Dark Meadows', 'Menhir', 'Mushroom', 'Peaceful Meadows',
  'Dandelion Meadows', 'Raspberry Meadows', 'Birch Meadows', 'Smalltree Meadows',
  // Black Forest
  'Troll Black Forest', 'Root Black Forest', 'Ruin Black Forest', 'Rock Black Forest',
  'Pinetree Black Forest', 'Kalhygge Black Forest', 'Blueberry Black Forest',
  // Swamp
  'Abomination Swamp', 'Bog Swamp', 'Bones', 'Hut Swamp', 'Bat Swamp',
  // Mountain
  'Fortress Mountain', 'Drake Mountain', 'Wolf Mountain',
  // Plains
  'Goblin Plains', 'Death Plains', 'Lox Plains',
  // Mistlands
  'BroodSwarm Mistlands', 'Swords Mistlands', 'Trees Mistlands', 'Rockless Mistlands', 'Hare Mistlands',
];
const PRIORITY = new Map(STROKE_PRIORITY.map((n, i) => [n, i]));

/// A sector's variants, outermost ring first.
export function byStrokePriority(alts: readonly string[]): string[] {
  return [...alts].sort((a, b) => (PRIORITY.get(a) ?? STROKE_PRIORITY.length) - (PRIORITY.get(b) ?? STROKE_PRIORITY.length));
}

/// Atlas columns: keeps the atlas within 1024 px wide, which every GPU handles.
const ATLAS_COLS = 4;

/// Variants the game's data places but that never actually show up in real
/// games: off unless an admin switches them on.
export const HIDDEN_BY_DEFAULT: ReadonlySet<string> = new Set(['Lantern']);

/// How a variant shows right now: the code default above, then the admin's override.
export interface VariantLook {
  color: string | null;   // stroke colour; null = not drawn (no default and no override)
  hidden: boolean;        // off: no stroke, not in the hover card
  hiddenByDefault: boolean;
  def?: BiomePattern;
}

export function variantLook(name: string): VariantLook {
  const o = getPoiConfig().altBiomes[name];
  const def = BIOME_PATTERNS[name];
  const hiddenByDefault = HIDDEN_BY_DEFAULT.has(name);
  return {
    color: o?.color ?? def?.tint ?? null,
    hidden: o?.visible === false || (o?.visible == null && hiddenByDefault),
    hiddenByDefault,
    def,
  };
}

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/// The LUTs VectorMap needs for the current config (see VectorMap.setPatternOverlay):
/// pattern look, rows per sector entry: 0 tint rgb + slot 1; 1 spread 1, slot 2,
/// spread 2, slot 3; 2 spread 3, shown flag. Strokes: row k, (k+1)th colour.
export function variantLuts(sectors: AltSector[], slotOf: Map<string, number>): { lut: Uint8Array; strokeLut: Uint8Array } {
  const lut = new Uint8Array(256 * 4 * 4);
  const strokeLut = new Uint8Array(256 * 4 * 4);
  const ROW = 256 * 4;
  sectors.slice(0, 255).forEach((s, i) => {
    const all = byStrokePriority(s.alts).map(variantLook).filter(l => !l.hidden && l.color);
    if (!all.length) return;
    const o = (i + 1) * 4;
    all.slice(0, MAX_STROKES).forEach((l, k) => strokeLut.set([...rgb(l.color!), 255], k * ROW + o));
    // Tint from the first variant listed, patterned or not.
    lut.set(rgb(all[0].color!), o);
    lut[2 * ROW + o + 1] = 255;
    const defs = [...new Map(all.filter(l => l.def?.pattern).map(l => [l.def!.pattern, l.def!])).values()].slice(0, 3);
    const slots = defs.map(d => slotOf.get(d.pattern!) ?? 0);
    const spreads = defs.map(d => Math.round((d.spread ?? 1) * 32));
    lut[o + 3] = slots[0] ?? 0;
    lut[ROW + o] = spreads[0] ?? 0;
    lut[ROW + o + 1] = slots[1] ?? 0;
    lut[ROW + o + 2] = spreads[1] ?? 0;
    lut[ROW + o + 3] = slots[2] ?? 0;
    lut[2 * ROW + o] = spreads[2] ?? 0;
  });
  return { lut, strokeLut };
}

/// Everything VectorMap.setPatternOverlay needs for one seed (plus its sectors,
/// for the hover card), or null when the seed has no variant data (generated
/// before it was recorded).
export async function loadPatternOverlay(baseUrl: string): Promise<PatternOverlay | null> {
  const [sectorsRes, gridRes] = await Promise.all([fetch(`${baseUrl}/altbiomes`), fetch(`${baseUrl}/altbiomegrid`)]);
  if (!sectorsRes.ok || !gridRes.ok || !gridRes.body) return null;
  const sectors: AltSector[] = await sectorsRes.json();
  const grid = new Uint8Array(await new Response(gridRes.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const size = Math.round(Math.sqrt(grid.length));
  if (size * size !== grid.length) return null;

  // One atlas slot per pattern this seed uses.
  const slotOf = new Map<string, number>();
  for (const s of sectors.slice(0, 255))
    for (const a of s.alts) {
      const pattern = BIOME_PATTERNS[a]?.pattern;
      if (pattern && !slotOf.has(pattern)) slotOf.set(pattern, slotOf.size + 1);
    }
  // Returned even with nothing to draw: the map's hover card still uses the sectors.

  // At least one slot: a seed with only tint-only variants still needs a valid texture.
  const cols = Math.max(1, Math.min(ATLAS_COLS, slotOf.size)), rows = Math.max(1, Math.ceil(slotOf.size / cols));
  const atlas = document.createElement('canvas');
  atlas.width = SLOT_PX * cols;
  atlas.height = SLOT_PX * rows;
  const ctx = atlas.getContext('2d')!;
  await Promise.all([...slotOf].map(async ([pattern, slot]) => {
    const img = new Image();
    img.src = `${PATTERN_BASE}${pattern}.svg`;
    try { await img.decode(); } catch { return; }   // missing tile: tint only
    ctx.drawImage(img, ((slot - 1) % cols) * SLOT_PX, Math.floor((slot - 1) / cols) * SLOT_PX, SLOT_PX, SLOT_PX);
  }));
  return { grid, size, ...variantLuts(sectors, slotOf), atlas, cols, rows, slotOf, sectors };
}
