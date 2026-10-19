import { useEffect, useState } from 'react';
import builtinIcons, { version as builtinVersion } from 'virtual:poi-icons';

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
  lod?: number;          // level of detail 0-3: its zoom band (LOD_BANDS)
  borrowed?: boolean;    // placeholder: reuses another POI type's art (tracked on /auth/pois)
}

// ── Level of detail ─────────────────────────────────────────────────────────
// Each LOD is a zoom band, like a map style's minzoom per layer: below
// `dotFrom` its POIs are hidden, from `dotFrom` they're dots, from `iconFrom`
// icons. The style depends only on the LOD and the zoom, never on what's
// nearby, so every POI of a LOD (and so every POI of a prefab) looks the same
// at a given zoom. Each step fades in over a short zoom range (LOD_FADE)
// rather than popping. Where markers overlap, draw order decides: higher
// priority (lower LOD) on top. See poiLayer.ts for the drawing.
//
// Zoom is the map scale: screen px per map px on the 1024px map, so a whole
// world fits at ~0.9 on a desktop and ~0.35 on a phone.

export const LOD_LEVELS = [0, 1, 2, 3] as const;
export const LOD_LABELS: readonly string[] = ['Always', 'Region', 'Area', 'Close-up'];

export interface LodBand { dotFrom: number; iconFrom: number }
export const LOD_BANDS: readonly LodBand[] = [
  { dotFrom: 0, iconFrom: 0 },      // Always: an icon at every zoom
  { dotFrom: 0.25, iconFrom: 1 },   // Region
  { dotFrom: 0.5, iconFrom: 2 },    // Area
  { dotFrom: 1, iconFrom: 4 },      // Close-up
];

/// Each step fades in between its threshold and this many times it.
export const LOD_FADE = 1.25;

const BASE_WORLD_SIZE = 24;   // icon size per unit of map scale (matches vhcli)
const MAX_SCREEN_PX = 32;     // icons never grow past this (before ICON_SCALE)
/// Every map icon draws this much larger than the sizes above.
const ICON_SCALE = 1.25;
/// LOD 1-3 icons draw at this fraction of a LOD 0 icon, so even at full zoom
/// they stay smaller than bosses, traders and the start.
const MINOR_SIZE_FACTOR = 0.75;
export const DOT_PX = 5;      // dot diameter

export interface LodStyle { dotAlpha: number; iconAlpha: number; iconSize: number }

/// How every POI of this LOD draws at this zoom. Alphas are 0-1; both can be
/// partly on while an icon fades in over its dot.
export function lodStyle(lod: number, scale: number, sizeScale = 1): LodStyle {
  const l = Math.max(0, Math.min(3, lod));
  const capped = Math.min(MAX_SCREEN_PX, BASE_WORLD_SIZE * scale * sizeScale) * ICON_SCALE;
  if (l === 0) return { dotAlpha: 0, iconAlpha: 1, iconSize: capped };
  const band = LOD_BANDS[l];
  const iconAlpha = ramp(scale, band.iconFrom);
  return { dotAlpha: ramp(scale, band.dotFrom) * (1 - iconAlpha), iconAlpha, iconSize: capped * MINOR_SIZE_FACTOR };
}

function ramp(scale: number, from: number): number {
  if (from <= 0) return 1;
  return Math.max(0, Math.min(1, (scale - from) / (from * (LOD_FADE - 1))));
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
  lod?: number | null;       // 0-3, see LOD_BANDS
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
  return {
    ...rule,
    icon: o.icon ?? rule.icon,
    color: o.color ?? rule.color,
    lod: o.lod ?? rule.lod,
    borrowed: o.icon ? undefined : rule.borrowed,
  };
}

/// The code default for a POI, before admin overrides. Art depends only on the
/// prefab, never on what's inside, so every POI of a prefab looks the same.
// Dot colours shared by every prefab drawn with the same art.
const WOOD_BROWN = '#8b5a2b';    // wooden houses, mountain log cabins, swamp huts
const TAR_BLACK = '#111111';     // tar pits
const STONE_GREY = '#9a9a9a';    // stone ruins
const SUNK_GREY = '#555555';     // sunken stone ruins
const HENGE_RED = '#c0392b';     // stonehenges and the StoneTowerRuins04 vegvisir site
const CHARRED_GREY = '#5c5552';  // Ashlands charred ruins

export function defaultPoiIcon(poi: PoiMarker): IconRule | null {
  switch (poi.type) {
    case 'Boss Altar':       return { icon: 'boss',           color: '#ffffff' };
    case 'Start':            return { icon: 'start',          color: '#ffffff', sizeScale: 1.5 };
    case 'AncientUpgradeStation': return { icon: 'forgeofpotential', color: '#ffffff' };
    case 'Trader':
      switch (poi.prefab) {
        case 'Vendor_BlackForest': return { icon: 'haldor',   color: '#ffffff' };
        case 'Hildir_camp':        return { icon: 'hildir',   color: '#ffffff' };
        case 'BogWitch_Camp':      return { icon: 'bogwitch', color: '#ffffff' };
        default:                   return { icon: 'cauldron', color: '#ffffff' };
      }
    // ── Meadows / Black Forest ──
    // Only the houses that read well on the map; the rest stay off.
    case 'House':
      switch (poi.prefab) {
        case 'WoodHouse1':
        case 'WoodHouse7':   return { icon: 'woodhouse2', color: WOOD_BROWN, lod: 3 };
        case 'WoodHouse12':  return { icon: 'woodhouse6', color: WOOD_BROWN, lod: 3 };
        case 'WoodHouse5':
        case 'WoodHouse9':
        case 'WoodHouse10':
        case 'WoodHouse11':
        case 'WoodHouse13':  return { icon: 'woodhouse',  color: WOOD_BROWN, lod: 3 };
        default:             return null;
      }
    case 'Village':          return { icon: 'farm',           color: '#ffffff', lod: 2 };
    case 'AbandonedCabin':   return { icon: 'logcabin',       color: WOOD_BROWN, lod: 3 };
    case 'StoneHenge':       return { icon: 'stonehenge',     color: HENGE_RED, lod: 1 };
    case 'BoarRunestone':    return { icon: 'boar7',          color: '#c8a070', lod: 2 };
    case 'GreydwarfNest':    return { icon: 'greydwarfnest',  color: '#ff69b4', lod: 1 };
    case 'TrollCave':        return { icon: 'trollcave',      color: '#4a90c4', lod: 2 };
    case 'Crypt':            return { icon: 'chamber',        color: '#9e9b8e', lod: 2 };
    case 'HildirDungeon':    return { icon: 'quest',          color: '#ffffff', lod: 1 };
    case 'Ruin':
      return poi.prefab === 'Ruin3' ? { icon: 'stonetower2', color: '#ffffff', lod: 3 } : null;
    case 'StoneHouse':       return { icon: 'stoneruinssunk', color: SUNK_GREY, lod: 3 };
    case 'StoneTowerRuins':
      switch (poi.prefab) {
        case 'StoneTowerRuins05':
        case 'StoneTowerRuins05_leet': return { icon: 'stonetowerruinsleet', color: '#1f3a93', lod: 3 };
        case 'StoneTowerRuins07_sunk':
        case 'StoneTowerRuins08_sunk':
        case 'StoneTowerRuins09_sunk': return { icon: 'stoneruinssunk', color: SUNK_GREY, lod: 3 };
        default:                       return { icon: 'stoneruins',     color: STONE_GREY, lod: 3 };
      }
    // ── Ocean ──
    case 'Shipwreck':
      switch (poi.prefab) {
        case 'ShipWreck01_DN': return { icon: 'shipwreck',     color: '#57423d', lod: 2 };
        case 'ShipWreck02_DN': return { icon: 'shipwrecksnow', color: '#45342b', lod: 2 };
        default:               return { icon: 'shipwreck',     color: '#ffffff', lod: 1 };
      }
    // ── Swamp / Mountain / Plains ──
    case 'SunkenCrypt':      return { icon: 'sunkencrypt',    color: '#4a7a3d', lod: 1 };
    // Vegvisir sites: the vegvisir itself is a 30-70% RandomSpawn; the POI card
    // says whether this one got it. Some sites read better as the ruin they are.
    case 'RuinVegvisir':     return { icon: 'stoneruins',     color: STONE_GREY, lod: 2 };
    case 'SwampVegvisir':
      return poi.prefab === 'SwampRuin1'
        ? { icon: 'stoneruinsround', color: '#8b7355', lod: 1 }
        : { icon: 'vegvisir',        color: '#8b7355', lod: 1 };
    case 'PlainsVegvisir':   return { icon: 'stonehenge',     color: HENGE_RED, lod: 1 };
    case 'MountainVegvisir': return { icon: 'vegvisir',       color: HENGE_RED, lod: 1 };   // StoneTowerRuins04
    case 'SwampHut':
      return poi.prefab === 'SwampHut5'
        ? { icon: 'stoneruinsround', color: WOOD_BROWN, lod: 3 }
        : { icon: 'pier',            color: WOOD_BROWN, lod: 3 };
    case 'MountainCave':     return { icon: 'mountaincave',   color: '#33aaff', lod: 2 };
    case 'DrakeNest':        return { icon: 'egg',            color: '#ff69b4', lod: 1 };
    case 'StoneTower':       return { icon: 'stonetower',     color: '#c8a050', lod: 3 };
    case 'Totem':
      switch (poi.prefab) {
        case 'StoneTower1':  return { icon: 'stonetower', color: '#c8a050', lod: 2 };
        case 'GoblinCamp2':  return { icon: 'goblincamp', color: '#c8a050', lod: 2 };
        default:             return { icon: 'totem',      color: '#c8a050', lod: 2 };
      }
    case 'GoblinHut':        return { icon: 'goblinhut',      color: '#ffffff', lod: 3 };
    case 'TarPit':           return { icon: 'tarpit',         color: TAR_BLACK, lod: 3 };
    // ── Mistlands ──
    case 'InfestedMine':     return { icon: 'infestedmine',   color: '#6a4e8a', lod: 2 };
    case 'DvergrHouse':      return { icon: 'dvergrhouse',    color: '#c89060', lod: 2 };
    case 'DvergrTower':      return { icon: 'dvergrtower',    color: '#3d6fb6', lod: 2 };   // blue jute
    case 'Harbour':          return { icon: 'harbour',        color: '#c87137', lod: 2 };
    case 'GiantSwords':      return { icon: 'giantswords',    color: '#c4562a', lod: 2 };
    case 'GiantRemains':
      return poi.prefab === 'Mistlands_Giant2'
        ? { icon: 'giantribcage', color: '#6a6a62', lod: 2 }
        : { icon: 'giantskull',   color: '#6a6a62', lod: 2 };
    case 'Excavation':
      switch (poi.prefab) {
        case 'Mistlands_Excavation1': return { icon: 'excavationskull',   color: '#b06d32', lod: 2 };
        case 'Mistlands_Excavation2': return { icon: 'excavationribcage', color: '#b06d32', lod: 2 };
        default:                      return { icon: 'excavation',        color: '#b06d32', lod: 2 };
      }
    case 'Viaduct':
      return poi.prefab === 'Mistlands_Viaduct2'
        ? { icon: 'viaductpillar', color: '#5c7a34', lod: 2 }
        : { icon: 'viaduct',       color: '#5c7a34', lod: 2 };
    // ── Ashlands ──
    case 'CharredFortress':  return { icon: 'fortress',       color: '#cc4040', lod: 1 };
    case 'CharredRuins':
      switch (poi.prefab) {
        case 'CharredRuins1': return { icon: 'charredruinslarge',  color: CHARRED_GREY, lod: 2 };
        case 'CharredRuins2': return { icon: 'charredruinsmedium', color: CHARRED_GREY, lod: 3 };
        default:              return { icon: 'charredruinssmall',  color: CHARRED_GREY, lod: 3 };
      }
    case 'PlaceOfMystery':   return { icon: 'tormentelite',   color: '#a070d0', lod: 0 };
    case 'PutridHole':       return { icon: 'putridhole',     color: '#a8923a', lod: 2 };
    case 'Geyser':           return { icon: 'surtlingspawner',color: '#ff6820', lod: 3 };
    case 'LavaLeviathan':    return { icon: 'leviathanlava',  color: '#4fb8b0', lod: 2 };
    // ── Deep North (1.0) ──
    case 'Morkhalla':        return { icon: 'morkhalla',      color: '#7f9bb5', lod: 2 };
    case 'WindingTunnels':   return { icon: 'thehole',        color: '#7fd0e0', lod: 2 };
    // Placeholder: borrows the vegvisir art until it has its own.
    case 'AncestralMemorial':return { icon: 'vegvisir',       color: '#b9c6d4', lod: 2, borrowed: true };
    case 'NorthVillage':
      return poi.prefab === 'DN_hut01'
        ? { icon: 'northhut',     color: '#8a6a45', lod: 2 }
        : { icon: 'northvillage', color: '#8a6a45', lod: 2 };
    case 'LumberCamp':       return { icon: 'northhut',       color: '#ffffff', lod: 3 };
    case 'BearCave':         return { icon: 'bearcave',       color: '#8a5a3a', lod: 2 };
    case 'FrozenShip':       return { icon: 'frozenship',     color: '#9fd8e8', lod: 3 };
    // 'IcePond' is generated and searchable but deliberately unmapped.
    default:                 return null;
  }
}

// ── Image cache ─────────────────────────────────────────────────────────────
// Uploaded icons are served by the API, versioned so a replacement is a new URL.

function iconUrl(name: string): string {
  const v = poiConfig.icons[name];
  if (v) return `/api/poi/icons/${name}.svg?v=${v}`;
  // The version changes whenever any built-in icon does, so a deploy is never
  // masked by a browser's cached copy.
  const t = devEdits.get(name);
  return `${ICON_BASE}${name}.svg?v=${builtinVersion}${t ? `&t=${t}` : ''}`;
}

// Dev only: poi-sync rewrote a built-in icon (an Inkscape save in web/poi-src).
// A new URL misses every cache below, and the config bump redraws all maps.
const devEdits = new Map<string, number>();
if (import.meta.hot) {
  import.meta.hot.on('poi-icons:update', ({ name }: { name: string }) => {
    devEdits.set(name, Date.now());
    setPoiConfig(poiConfig);
  });
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
