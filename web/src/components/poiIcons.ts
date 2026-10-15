import { useEffect, useState } from 'react';
import builtinIcons from 'virtual:poi-icons';

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
  biome?: string;        // seedgen's GetBiome at the POI, e.g. 'BlackForest'
  // Ground truth from seedgen spawning the location in a real server:
  chests?: { item: string; count: number }[][];  // each chest's contents
  creatures?: Record<string, number>;            // enemy spawners by creature (or "spawner:<name>")
  vegvisirs?: string[];                          // locations a vegvisir points to, e.g. "Dragonqueen"
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
  lod?: number;          // level of detail 0-3: zoom at which the icon replaces its dot (LOD_ZOOM)
  borrowed?: boolean;    // placeholder: reuses another POI type's art (tracked on /auth/pois)
  find?: boolean;        // icon shows what's inside (beehive, axe head); an admin icon override doesn't replace it
}

// ── Level of detail ─────────────────────────────────────────────────────────
// Every shown POI is on the map at every zoom; its LOD decides whether it's a
// full icon or a small dot. LOD 0 (bosses, start, traders) is always an icon;
// LOD 1-3 stay dots until the map is zoomed past LOD_ZOOM[lod], so the
// overview stays readable and detail arrives in waves as you zoom in.

export const LOD_LEVELS = [0, 1, 2, 3] as const;

/// Map scale at which each LOD switches from dot to icon.
export const LOD_ZOOM: readonly number[] = [0, 1, 2, 4];

export const LOD_LABELS: readonly string[] = ['Always', 'Region', 'Area', 'Close-up'];

/// A non-zero LOD icon is also held back until it's at least this big on screen,
/// so it never pops in as an unreadable smudge.
export const MIN_MINOR_SCREEN_PX = 12;

/// LOD 1-3 icons draw at this fraction of a LOD 0 icon, after the max-size cap,
/// so even at full zoom they stay smaller than bosses/traders/start.
export const MINOR_SIZE_FACTOR = 0.75;

const BASE_WORLD_SIZE = 24;   // marker size per unit of map scale (matches vhcli)
const MAX_SCREEN_PX = 32;     // icons never grow past this
const DOT_PX = 5;             // diameter of a not-yet-detailed marker

export interface MarkerDraw { kind: 'icon' | 'dot'; size: number }

/// How a POI with this rule draws at this map scale. Shared by every map and
/// the click hit-test, so they can't disagree.
export function markerFor(rule: IconRule, scale: number): MarkerDraw {
  const lod = Math.max(0, Math.min(3, rule.lod ?? 0));
  const capped = Math.min(MAX_SCREEN_PX, BASE_WORLD_SIZE * scale * (rule.sizeScale ?? 1));
  if (lod === 0) return { kind: 'icon', size: capped };
  const size = capped * MINOR_SIZE_FACTOR;
  if (scale >= LOD_ZOOM[lod] && size >= MIN_MINOR_SCREEN_PX) return { kind: 'icon', size };
  return { kind: 'dot', size: DOT_PX };
}

/// Draw one marker centred on (sx, sy) in screen pixels.
export function drawMarker(ctx: CanvasRenderingContext2D, rule: IconRule, m: MarkerDraw, sx: number, sy: number) {
  ctx.save();
  ctx.globalAlpha = rule.opacity ?? 1;
  if (m.kind === 'dot') {
    ctx.beginPath();
    ctx.arc(sx, sy, m.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = rule.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();
  } else {
    const icon = getColoredIcon(rule.icon, rule.color);
    // `complete` is true once the data-URL Image has rasterized (or errored).
    // We don't gate on naturalWidth — some browsers report 0 for SVGs that draw fine.
    if (icon.complete) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      try { ctx.drawImage(icon, sx - m.size / 2, sy - m.size / 2, m.size, m.size); }
      catch { /* broken icon: the marker just skips */ }
    }
  }
  ctx.restore();
}

const ICON_BASE = '/img/Poi/';

/// SVGs shipped in /img/Poi — discovered from the folder at build time
/// (scripts/poi-icons-plugin.ts), so dropping a file in is all it takes.
/// Admin-uploaded icons (PoiConfig.icons) are added to these, and an upload
/// with a built-in's name replaces its art.
export const BUILTIN_ICONS: readonly string[] = builtinIcons;

/// Generic pin for types switched on without art of their own.
export const FALLBACK_ICON = 'marker';

// ── Admin overrides (GET /api/poi/config, edited on /auth/pois) ──────────────

export interface PoiSetting {
  visible?: boolean | null;  // false hides the prefab; true shows every POI of it
  icon?: string | null;
  color?: string | null;
  lod?: number | null;       // 0-3, see LOD_ZOOM
}

export interface PoiConfig {
  prefabs: Record<string, PoiSetting>;   // per-prefab overrides, keyed by prefab name
  icons: Record<string, number>;   // uploaded icon name -> version (updatedAt ms)
}

let poiConfig: PoiConfig = { prefabs: {}, icons: {} };
let configVersion = 0;
let configLoad: Promise<void> | null = null;
const configListeners = new Set<() => void>();

let configError: Error | null = null;

export function getPoiConfig(): PoiConfig { return poiConfig; }
/// Why the last config fetch failed (maps then fall back to code defaults), or null.
export function getPoiConfigError(): Error | null { return configError; }

/// Replace the config (after an admin save, or a fetch) and redraw everything.
export function setPoiConfig(next: PoiConfig) {
  poiConfig = next;
  configVersion++;
  for (const cb of configListeners) cb();
  for (const cb of redrawSubscribers) cb();
}

/// Fetch the config once per page load; `force` refetches.
export function loadPoiConfig(force = false): Promise<void> {
  if (!configLoad || force) {
    configLoad = fetch('/api/poi/config')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((c: PoiConfig) => {
        configError = null;
        setPoiConfig({ prefabs: c.prefabs ?? {}, icons: c.icons ?? {} });
      })
      .catch(err => {
        console.warn('[poiIcons] config fetch failed; using code defaults', err);
        configError = err instanceof Error ? err : new Error(String(err));
        configVersion++;
        for (const cb of configListeners) cb();
      });
  }
  return configLoad;
}

/// React hook: re-render when the POI config changes. Returns its version,
/// handy as a useMemo dependency.
export function usePoiConfigVersion(): number {
  const [v, setV] = useState(configVersion);
  useEffect(() => {
    const cb = () => setV(configVersion);
    configListeners.add(cb);
    loadPoiConfig();
    cb();
    return () => { configListeners.delete(cb); };
  }, []);
  return v;
}

/// Map a POI to (icon, color, size, opacity), or null when it shouldn't render:
/// the code default for its type with that prefab's admin override applied on top.
export function resolvePoiIcon(poi: PoiMarker): IconRule | null {
  if (!configLoad) loadPoiConfig();   // maps redraw via redrawSubscribers when it lands
  const base = defaultPoiIcon(poi);
  const o = poi.prefab ? poiConfig.prefabs[poi.prefab] : undefined;
  if (!o) return base;
  if (o.visible === false) return null;
  const rule = base ?? (o.visible ? { icon: FALLBACK_ICON, color: '#ffffff', lod: 3 } : null);
  if (!rule) return null;
  // A find (e.g. a house's beehive) keeps its own icon; the override's art is for the rest.
  if (rule.find) return { ...rule, lod: o.lod ?? rule.lod };
  return {
    ...rule,
    icon: o.icon ?? rule.icon,
    color: o.color ?? rule.color,
    lod: o.lod ?? rule.lod,
    borrowed: o.icon ? undefined : rule.borrowed,
  };
}

/// The code default for a POI, before admin overrides.
export function defaultPoiIcon(poi: PoiMarker): IconRule | null {
  const items = poi.items ?? [];
  switch (poi.type) {
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
      if (hasCurious)    return { icon: 'axehead',  color: '#c0c0c0', lod: 1, find: true };
      if (hasMysterious) return { icon: 'axehead',  color: '#cd7f32', lod: 1, find: true };
      if (hasBee)        return { icon: 'beehive',  color: '#f0c040', lod: 1, find: true };
      return null;
    }
    case 'BoarRunestone':    return { icon: 'boar7',          color: '#c8a070', lod: 2 };
    case 'Shipwreck':        return { icon: 'shipwreck',      color: '#ffffff', lod: 3 };
    case 'GreydwarfNest':    return { icon: 'greydwarfnest',  color: '#7b2d8b', lod: 2 };
    case 'TrollCave':        return { icon: 'trollcave',     color: '#4a90c4', lod: 2 };
    case 'Crypt':            return { icon: 'chamber',        color: '#9e9b8e', lod: 2 };
    case 'SunkenCrypt':      return { icon: 'sunkencrypt',    color: '#4a7a3d', lod: 2 };
    case 'Geyser':           return { icon: 'surtlingspawner',color: '#ff6820', lod: 3 };
    // Each of these vegvisirs is a RandomSpawn (30-70%): seedgen reports whether this one got it.
    case 'RuinVegvisir':
    case 'SwampVegvisir':
    case 'PlainsVegvisir':
    case 'MountainVegvisir':
      return items.includes('Vegvisir') ? { icon: 'vegvisir', color: '#8b7355', lod: 1 } : null;
    case 'MountainCave':     return { icon: 'mountaincave',   color: '#a0a0a0', lod: 2 };
    case 'DrakeNest':        return { icon: 'egg',            color: '#ff69b4', lod: 2 };
    case 'StoneTower':       return { icon: 'stonetower',     color: '#c8a050', lod: 2 };
    case 'Totem': {
      if (poi.prefab === 'StoneTower1') return { icon: 'stonetower', color: '#c8a050', lod: 2 };
      const hasTotem = poi.prefab !== 'GoblinCamp2' || items.includes('GoblinTotem');
      return hasTotem
        ? { icon: 'totem', color: '#c8a050', lod: 2 }
        : { icon: 'camp',  color: '#6b4226', lod: 2 };
    }
    case 'InfestedMine':     return { icon: 'infestedmine',   color: '#6a4e8a', lod: 2 };
    case 'CharredFortress':  return { icon: 'fortress',       color: '#cc4040', lod: 2 };
    case 'DvergrHouse':      return { icon: 'dvergrhouse',    color: '#c89060', lod: 2 };
    case 'DvergrTower':      return { icon: 'dvergrtower',    color: '#8aa0b0', lod: 2 };
    case 'PlaceOfMystery':   return { icon: 'tormentelite',   color: '#a070d0', lod: 2 };
    case 'PutridHole':       return { icon: 'putridhole',     color: '#a8923a', lod: 2 };
    // ── Deep North (1.0) ──
    // No dedicated art yet — these borrow the closest existing SVG and lean on
    // colour to stay distinguishable. Swap the `icon` values (and drop
    // `borrowed`) once Deep North SVGs land in /img/Poi.
    case 'Morkhalla':        return { icon: 'morkhalla',      color: '#7f9bb5', lod: 2 };
    case 'WindingTunnels':   return { icon: 'mountaincave',   color: '#7fd0e0', lod: 2, borrowed: true };
    case 'AncestralMemorial':return { icon: 'vegvisir',       color: '#b9c6d4', lod: 2, borrowed: true };
    case 'NorthVillage':
      return poi.prefab === 'DN_hut01'
        ? { icon: 'northhut', color: '#8a6a45', lod: 2 }
        : { icon: 'camp',     color: '#8a6a45', lod: 2, borrowed: true };
    case 'BearCave':         return { icon: 'bearcave',       color: '#8a5a3a', lod: 2 };
    case 'FrozenShip':       return { icon: 'shipwreck',      color: '#9fd8e8', lod: 2, borrowed: true };
    // 'IcePond' and 'LumberCamp' are generated and searchable but deliberately
    // unmapped: nothing in the current icon set reads as either one.
    default:                 return null;
  }
}

// ── Image cache ─────────────────────────────────────────────────────────────
// Uploaded icons are served by the API, versioned so a replacement is a new URL.

function iconUrl(name: string): string {
  const v = poiConfig.icons[name];
  return v ? `/api/poi/icons/${name}.svg?v=${v}` : ICON_BASE + name + '.svg';
}
// SVGs ship with `currentColor` as the fill placeholder. For each unique
// (icon, color) pair we fetch the source once, substitute, encode as a
// data: URL, and cache the resulting Image for cheap subsequent draws.

const svgTextCache = new Map<string, Promise<string>>();
const iconImageCache = new Map<string, HTMLImageElement>();
const redrawSubscribers = new Set<() => void>();

export function loadSvgText(name: string): Promise<string> {
  const url = iconUrl(name);
  let p = svgTextCache.get(url);
  if (!p) {
    p = fetch(url)
      .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)));
    svgTextCache.set(url, p);
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
  const key = iconUrl(name) + '|' + color;
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
