// Map patterns for biome variants (the game's alt biomes, see BIOME_VARIANTS.md).
//
// The map outlines each variant sector with a heavy stroke in its variant's
// tint; a sector carrying several variants gets one more stroke inside per
// extra variant (up to three), outermost first. (vector-map.js still has the
// older look, a tint wash plus up to three interleaved patterns, behind
// VARIANT_STYLE.)
//
// seedgen saves, per seed, the variant sectors the game placed
// (`/api/worlds/<seed>/altbiomes`) and a 2048x2048 grid of which sector each
// minimap cell is in (`/altbiomegrid`, gzipped). Every variant listed below gets
// its tint as a stroke around its sectors (vector-map.js renderPatterns).
//
// Adding one: draw a square tile in public/img/Patterns/<pattern>.svg (keep its
// shapes inside the tile with a margin, since it repeats edge to edge), then add
// its line here. Variant names are the game's (`AltBiome.m_name`).

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
  /// tint, alpha 255, or all 0 past its last variant.
  strokeLut: Uint8Array;
  /// The seed's variant sectors; a grid cell's value n (1-based) is sectors[n - 1].
  sectors: AltSector[];
}

/// Most strokes drawn around one sector: its first three variants.
const MAX_STROKES = 3;

/// Atlas columns: keeps the atlas within 1024 px wide, which every GPU handles.
const ATLAS_COLS = 4;

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

  // One atlas slot per pattern this seed uses. LUT rows, per sector entry (see
  // VectorMap.setPatternOverlay): 0 tint rgb + slot 1; 1 spread 1, slot 2,
  // spread 2, slot 3; 2 spread 3, shown flag.
  const slotOf = new Map<string, number>();
  const lut = new Uint8Array(256 * 4 * 4);
  const strokeLut = new Uint8Array(256 * 4 * 4);
  const ROW = 256 * 4;
  sectors.slice(0, 255).forEach((s, i) => {
    const all = s.alts.map(a => BIOME_PATTERNS[a]).filter(Boolean);
    if (!all.length) return;
    const o = (i + 1) * 4;
    all.slice(0, MAX_STROKES).forEach((d, k) => {
      strokeLut.set([parseInt(d.tint.slice(1, 3), 16), parseInt(d.tint.slice(3, 5), 16), parseInt(d.tint.slice(5, 7), 16), 255], k * ROW + o);
    });
    // Tint from the first variant listed, patterned or not.
    lut[o] = parseInt(all[0].tint.slice(1, 3), 16);
    lut[o + 1] = parseInt(all[0].tint.slice(3, 5), 16);
    lut[o + 2] = parseInt(all[0].tint.slice(5, 7), 16);
    lut[2 * ROW + o + 1] = 255;
    const defs = [...new Map(all.filter(d => d.pattern).map(d => [d.pattern, d])).values()].slice(0, 3);
    const slots = defs.map(d => {
      if (!slotOf.has(d.pattern!)) slotOf.set(d.pattern!, slotOf.size + 1);
      return slotOf.get(d.pattern!)!;
    });
    const spreads = defs.map(d => Math.round((d.spread ?? 1) * 32));
    lut[o + 3] = slots[0] ?? 0;
    lut[ROW + o] = spreads[0] ?? 0;
    lut[ROW + o + 1] = slots[1] ?? 0;
    lut[ROW + o + 2] = spreads[1] ?? 0;
    lut[ROW + o + 3] = slots[2] ?? 0;
    lut[2 * ROW + o] = spreads[2] ?? 0;
  });
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
  return { grid, size, lut, atlas, cols, rows, strokeLut, sectors };
}
