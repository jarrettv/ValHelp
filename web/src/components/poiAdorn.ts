// What a POI's adornments are: one small icon per copy of each starred thing
// it holds (2 black cores, 2 icons; capped at MAX_COPIES),
// drawn in a ring around its map icon at the deepest zooms (poiLayer.ts,
// ADORN_FROM in poiIcons.ts). The admin stars card entries per location or
// everywhere (poiContents.ts); vegvisirs are starred by default.
//
// Only what seedgen is sure of adorns: a vegvisir it found, an object it
// counted, an item a rolled chest holds — never a "maybe".

import { fetchVhItems } from '../guides/vh/data';
import { type PoiMarker, requestPoiRedraw } from './poiIcons';
import { contentStarred, creatureIcon, getPoiContents, itemKey, VEGVISIR_KEY, type ContentObject } from './poiContents';

/// Map art (an /img/Poi SVG, tinted) or an item icon (/api/icon/<code>.png).
/// `glow`: its light's colour, when not the POI's dot colour.
export type Adornment =
  | { key: string; svg: string; color: string; glow?: string }
  | { key: string; png: string; glow?: string };

/// Glow colours of their own, by card entry.
const GLOW_COLORS: Record<string, string> = {
  [VEGVISIR_KEY]: '#ff3030',                  // red
  Pickable_BlackCoreStand: '#ff5ec8',         // black core: pink
  blackmarble_altar_crystal: '#2ee6d0',       // sealbreaker fragment: teal
  Charred_altar_bellfragment: '#3ee05a',      // bell fragment: green
  'item:OnionSeeds': '#ffd83a',               // onion seeds: yellow
  goblin_totempole: '#ff2bff',                // fuling totem: magenta
  'item:GoblinTotem': '#ff2bff',              // ...and one rolled in a chest
};

const VEGVISIR_COLOR = '#f0c75e';   // the card's gold
const BEEHIVE_COLOR = '#e8b030';
const CHEST_ICON = 'chest_hildir1';
/// One adornment per copy, up to this many (a chest of 400 coins stays readable).
const MAX_COPIES = 8;
/// Entries that adorn once however many there are (a stack of seeds is one find),
/// by the find they share: a cave's loose tetras and its tetra spawners are one.
const ONE_COPY: Record<string, string> = {
  'item:OnionSeeds': 'onionseeds',
  Fish4_cave: 'tetra',
  Spawner_Fish4: 'tetra',
};

/// One adornment per copy (capped), each with its entry's own glow colour if it has one.
function copies(art: Adornment, n: number): Adornment[] {
  const glow = GLOW_COLORS[art.key];
  const one = ONE_COPY[art.key];
  if (one) return [{ ...art, ...(glow ? { glow } : {}), key: one }];
  return Array.from({ length: Math.min(n, MAX_COPIES) }, (_, i) => ({ ...art, ...(glow ? { glow } : {}), key: `${art.key}#${i}` }));
}

/// Creature id -> its trophy's item code, once items.json has loaded.
let trophies: Map<string, string> | null = null;
let trophiesLoading = false;

/// Changes when data adornments are built from lands (the layer re-resolves them).
export function adornDataKey(): unknown[] {
  return [getPoiContents(), trophies];
}
function trophyOf(creature: string | undefined): string | undefined {
  if (!trophies && !trophiesLoading) {
    trophiesLoading = true;
    fetchVhItems().then(items => {
      trophies = new Map();
      for (const i of items) if (i.trophyDrop?.id) trophies.set(i.trophyDrop.id, i.code);
      requestPoiRedraw();
    }).catch(() => { trophiesLoading = false; });
  }
  return trophies ? creatureIcon(creature, trophies) : undefined;
}

function objectArt(key: string, obj: ContentObject): Adornment | null {
  switch (obj.kind) {
    case 'enemy': { const t = trophyOf(obj.creature); return t ? { key, png: t } : null; }
    case 'spawner': { const t = trophyOf(obj.creatures?.[0]?.creature); return t ? { key, png: t } : null; }
    case 'beehive': return { key, svg: 'beehive', color: BEEHIVE_COLOR };
    case 'chest': return { key, png: CHEST_ICON };
    default: {
      const item = obj.item ?? obj.items?.[0]?.item ?? obj.table?.items[0]?.item;
      return item ? { key, png: item } : null;
    }
  }
}

/// The POI's adornments, in ring order. Changes with the admin config, and as
/// the catalogue and items.json land (both redraw the maps).
export function poiAdornments(poi: PoiMarker): Adornment[] {
  const prefab = poi.prefab;
  const out: Adornment[] = [];
  if (poi.vegvisirs?.length && contentStarred(prefab, VEGVISIR_KEY))
    poi.vegvisirs.forEach((v, i) => out.push({ key: `${VEGVISIR_KEY}#${i}:${v}`, svg: 'vegvisir', color: VEGVISIR_COLOR,
                                               glow: GLOW_COLORS[VEGVISIR_KEY] }));

  const counted = Object.entries(poi.contents ?? {}).filter(([, n]) => n > 0);
  const cat = counted.length || poi.chests?.length ? getPoiContents() : null;
  if (cat) {
    for (const [p, n] of counted.sort(([a], [b]) => a.localeCompare(b))) {
      const obj = cat.objects[p];
      if (!obj || !contentStarred(prefab, p)) continue;
      const art = objectArt(p, obj);
      if (art) out.push(...copies(art, n));
    }
  }
  // Chest items: only from chests the game rolled (exact), one per item across them all.
  const totals = new Map<string, number>();
  for (const chest of poi.chests ?? [])
    for (const { item, count } of chest)
      if (contentStarred(prefab, itemKey(item))) totals.set(item, (totals.get(item) ?? 0) + count);
  for (const [item, n] of totals) out.push(...copies({ key: itemKey(item), png: item }, n));
  // A shared find adorns once, however many of its entries the POI holds.
  return out.filter((a, i) => out.findIndex(b => b.key === a.key) === i);
}
