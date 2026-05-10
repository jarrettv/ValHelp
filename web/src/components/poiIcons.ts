// Shared POI icon resolver + colored data-URL Image cache.
// Used by both WorldMap (Worlds page) and EventMap (event playback).
//
// Mirrors ValHelpTools/vhcli/Rendering/MarkerDataBuilder.cs — same per-category
// colors, same opacity rules, same `currentColor` substitution + data-URL approach
// for tinting source SVGs into category-specific colored Images.

export interface PoiMarker {
  type: string;
  name: string;
  prefab?: string;
  x: number;
  z: number;
  generated?: boolean;
  items?: string[];
}

export interface IconRule {
  icon: string;          // bare filename stem under /img/Poi/<icon>.svg
  color: string;         // hex; substituted into the SVG's currentColor
  sizeScale?: number;    // multiplier on the base icon size (e.g. 1.5 for Sacrificial Stones)
  opacity?: number;      // canvas alpha (e.g. 0.25 for empty troll caves)
  minor?: boolean;       // hide unless zoom scale ≥ MINOR_ZOOM_THRESHOLD (matches vhcli)
}

/// Below this map scale, only major markers (bosses/start/traders) render at all.
/// Tuned high so casual zooming on the overview keeps the map clean — the user has
/// to zoom into a region before dungeon/house/vegvisir/totem clutter surfaces.
export const MINOR_ZOOM_THRESHOLD = 4.0;

/// In addition to the zoom gate above, an individual minor marker is only drawn if
/// its own on-screen size (after the size factor below) meets this minimum.
/// Combined with viewport culling this gives a smooth fade-in as you zoom in.
export const MIN_MINOR_SCREEN_PX = 12;

/// Minor markers (houses, dungeons, vegvisirs, totems, ...) render at this fraction
/// of the major marker size *after the per-frame max-size cap* — so even at full
/// zoom they stay visibly smaller than the boss/trader/start icons.
export const MINOR_SIZE_FACTOR = 0.75;

const ICON_BASE = '/img/Poi/';

/// Map a POI to (icon, color, size, opacity). Returns null when the POI shouldn't render.
/// Handles both formats:
///   • Old short-form (cached pois files written by an earlier seedgen):
///     { type: 'boss' | 'haldor' | 'hildir' | 'bogwitch' | 'trader' | 'start', ... }
///   • New long-form (LocationFinder.ReadFromWorldDb):
///     { type: 'Boss Altar' | 'Trader' | 'Start' | 'House' | 'Crypt' | 'Geyser' | … ,
///       prefab: '...', items: ['Beehive'|'Curious Axe Head'|'Troll'|...], … }
export function resolvePoiIcon(poi: PoiMarker): IconRule | null {
  const items = poi.items ?? [];
  switch (poi.type) {
    // ── Legacy short-form types ──
    case 'boss':             return { icon: 'boss',           color: '#ffffff' };
    case 'start':            return { icon: 'start',          color: '#ffffff', sizeScale: 1.5 };
    case 'haldor':           return { icon: 'haldor',         color: '#ffffff' };
    case 'hildir':           return { icon: 'hildir',         color: '#ffffff' };
    case 'bogwitch':         return { icon: 'bogwitch',       color: '#ffffff' };
    case 'trader':           return { icon: 'cauldron',       color: '#ffffff' };
    // ── New long-form types ──
    case 'Boss Altar':       return { icon: 'boss',           color: '#ffffff' };
    case 'Start':            return { icon: 'start',          color: '#ffffff', sizeScale: 1.5 };
    case 'Trader':
      switch (poi.prefab) {
        case 'Vendor_BlackForest': return { icon: 'haldor',   color: '#ffffff' };
        case 'Hildir_camp':        return { icon: 'hildir',   color: '#ffffff' };
        case 'BogWitch_Camp':      return { icon: 'bogwitch', color: '#ffffff' };
        default:                   return { icon: 'cauldron', color: '#ffffff' };
      }
    case 'House': {
      const hasCurious    = items.some(i => i.includes('Curious Axe Head')    && !i.includes('no '));
      const hasMysterious = items.some(i => i.includes('Mysterious Axe Head') && !i.includes('no '));
      const hasBee        = items.includes('Beehive');
      if (hasCurious)    return { icon: 'axehead',  color: '#c0c0c0', minor: true };
      if (hasMysterious) return { icon: 'axehead',  color: '#cd7f32', minor: true };
      if (hasBee)        return { icon: 'beehive',  color: '#f0c040', minor: true };
      return null;
    }
    case 'Runestone':        return { icon: 'boar7',          color: '#c8a070', minor: true };
    case 'Shipwreck':        return { icon: 'shipwreck',      color: '#ffffff', minor: true };
    case 'GreydwarfNest':    return { icon: 'greydwarfnest',  color: '#7b2d8b', minor: true };
    case 'TrollCave':        return { icon: 'trollcave',     color: '#4a90c4', minor: true };
    case 'Crypt':            return { icon: 'chamber',        color: '#9e9b8e', minor: true };
    case 'SunkenCrypt':      return { icon: 'sunkencrypt',    color: '#4a7a3d', minor: true };
    case 'Geyser':           return { icon: 'surtlingspawner',color: '#ff6820', minor: true };
    case 'RuinVegvisir':
    case 'SwampVegvisir':
    case 'PlainsVegvisir':
      return { icon: 'vegvisir', color: '#8b7355', minor: true };
    case 'MountainVegvisir':
      return items.includes('ModerVegvisir') ? { icon: 'vegvisir', color: '#8b7355', minor: true } : null;
    case 'MountainCave':     return { icon: 'mountaincave',   color: '#a0a0a0', minor: true };
    case 'DrakeNest':        return { icon: 'egg',            color: '#ff69b4', minor: true };
    case 'Totem': {
      const hasTotem = poi.prefab !== 'GoblinCamp2' || items.includes('GoblinTotem');
      return hasTotem
        ? { icon: 'totem', color: '#c8a050', minor: true }
        : { icon: 'camp',  color: '#6b4226', minor: true };
    }
    case 'InfestedMine':     return { icon: 'infestedmine',   color: '#6a4e8a', minor: true };
    case 'CharredFortress':  return { icon: 'fortress',       color: '#cc4040', minor: true };
    case 'DvergrHouse':      return { icon: 'dvergrhouse',    color: '#c89060', minor: true };
    case 'DvergrTower':      return { icon: 'dvergrtower',    color: '#8aa0b0', minor: true };
    case 'PlaceOfMystery':   return { icon: 'tormentelite',   color: '#a070d0', minor: true };
    case 'PutridHole':       return { icon: 'putridhole',     color: '#a8923a', minor: true };
    default:                 return null;
  }
}

// ── Image cache ─────────────────────────────────────────────────────────────
// SVGs ship with `currentColor` as the fill placeholder. For each unique
// (icon, color) pair we fetch the source once, substitute, encode as a
// data: URL, and cache the resulting Image for cheap subsequent draws.

const svgTextCache = new Map<string, Promise<string>>();
const iconImageCache = new Map<string, HTMLImageElement>();
const redrawSubscribers = new Set<() => void>();

export function loadSvgText(name: string): Promise<string> {
  let p = svgTextCache.get(name);
  if (!p) {
    p = fetch(ICON_BASE + name + '.svg')
      .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)));
    svgTextCache.set(name, p);
  }
  return p;
}

/// Build a `data:image/svg+xml` URL for the given (icon, color) pair, suitable as
/// `<img src=...>`. Uses the same fetch+substitute pipeline as canvas marker rendering.
export async function getColoredIconDataUrl(name: string, color: string): Promise<string> {
  const svg = await loadSvgText(name);
  const colored = svg.split('currentColor').join(color);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(colored);
}

/// Returns a (possibly not-yet-loaded) Image for the given (icon, color) pair.
/// When the image finishes loading, every subscribed redraw callback fires so
/// the marker can be drawn in the next frame.
export function getColoredIcon(name: string, color: string): HTMLImageElement {
  const key = name + '|' + color;
  const existing = iconImageCache.get(key);
  if (existing) return existing;

  const img = new Image();
  iconImageCache.set(key, img);
  loadSvgText(name).then(svg => {
    const colored = svg.split('currentColor').join(color);
    img.onload = () => { for (const cb of redrawSubscribers) cb(); };
    img.onerror = () => console.warn('[poiIcons] icon failed to render', name, color);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(colored);
  }).catch(err => console.warn('[poiIcons] icon fetch failed', name, err));
  return img;
}

/// Subscribe a redraw callback so the calling component gets a redraw kick once
/// any colored icon finishes loading. Returns an unsubscribe function.
export function subscribeIconRedraw(cb: () => void): () => void {
  redrawSubscribers.add(cb);
  return () => { redrawSubscribers.delete(cb); };
}
