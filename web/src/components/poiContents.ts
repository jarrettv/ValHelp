import { useEffect, useState } from 'react';
import { getPoiConfig, requestPoiRedraw } from './poiIcons';

// What a map location can hold, and which of it the POI card shows.
//
// The catalogue (/data/vh/poi-contents.json, scripts/export_poi_contents.py)
// describes every object a location or dungeon room can spawn: chests with
// their drop tables, pickups, enemy spawners, smashable loot. Seedgen reports
// per POI how many of each object the instance holds (PoiMarker.contents).
//
// Card entries are keyed by object prefab, "vegvisir", or "item:<code>" (one
// item of the chests). The admin page shows or hides each one per location
// prefab, or for every location ("*"); otherwise the defaults below apply.

export type ContentKind = 'chest' | 'pickup' | 'item' | 'enemy' | 'spawner' | 'smash' | 'beehive';

/// One item of a drop table or pickup: the chance a chest (or pickup) holds it, and its stack.
export interface DropItem { item: string; chance: number; min: number; max: number }

export interface DropTable {
  rolls: [number, number];   // picks per chest, min-max
  chance: number;            // chance the chest has anything at all
  oneOfEach: boolean;        // an item is picked at most once
  items: DropItem[];
}

export interface ContentObject {
  kind: ContentKind;
  name: string;
  table?: DropTable;                          // chest, smash
  items?: DropItem[];                         // pickup: what it gives (several: one of them at random)
  item?: string;                              // item, beehive, smash (a single drop)
  creature?: string;                          // enemy
  levels?: [number, number];                  // enemy: star levels + 1
  creatures?: { creature: string; chance: number; levels: [number, number] }[];   // spawner
  respawnMinutes?: number;
}

/// What a location prefab or dungeon room holds: per object, the most one
/// instance can have and the chance of each copy.
export interface ContentHolder {
  objects: Record<string, { max: number; chance: number }>;
  rooms?: string[];       // dungeons: the rooms it can be built from
  vegvisirs?: string[];
}

export interface PoiContentsCatalog {
  objects: Record<string, ContentObject>;
  locations: Record<string, ContentHolder>;
  rooms: Record<string, ContentHolder>;
  names: Record<string, string>;   // item / creature code -> display name
}

let catalog: PoiContentsCatalog | null = null;
let loading: Promise<PoiContentsCatalog | null> | null = null;

function loadCatalog(): Promise<PoiContentsCatalog | null> {
  loading ??= fetch('/data/vh/poi-contents.json')
    .then(r => (r.ok ? r.json() : null))
    .then((c: PoiContentsCatalog | null) => (catalog = c))
    .catch(() => null);
  return loading;
}

/// The catalogue for non-React callers (the map layer): null until it has
/// loaded, and the first call starts the load, which redraws the maps.
export function getPoiContents(): PoiContentsCatalog | null {
  if (!catalog && !loading) loadCatalog().then(c => { if (c) requestPoiRedraw(); });
  return catalog;
}

/// The contents catalogue, or null until it has loaded.
export function usePoiContents(): PoiContentsCatalog | null {
  const [c, setC] = useState(catalog);
  useEffect(() => {
    if (!c) loadCatalog().then(setC);
  }, [c]);
  return c;
}

/// Creature variants that drop no trophy of their own -> the creature whose
/// trophy pictures them (a sleeping bear is a bear), or an item code for one
/// that has no trophy at all but is an item (the cave tetra).
const CREATURE_ICON_ALIAS: Record<string, string> = {
  Bjorn_sleeping: 'Bjorn',
  BlobElite: 'Blob',
  Draugr_Ranged: 'Draugr',
  Dverger: 'DvergerAshlands',
  DvergerMage: 'DvergerAshlands',
  ElakingLantern: 'Elaking',
  GoblinArcher: 'Goblin',
  JotunWarriorDualWield: 'JotunWarrior',
  Skeleton_Meadows_noarcher: 'Skeleton',
  Skeleton_Mountains: 'Skeleton',
  Skeleton_Swamps: 'Skeleton',
};
const CREATURE_ITEM_ICON: Record<string, string> = { Fish4_cave: 'Fish4_cave' };

/// The item code whose icon pictures a creature: its trophy, a stand-in's, or none.
/// `trophies`: creature id -> trophy item code (from items.json).
export function creatureIcon(creature: string | undefined, trophies: ReadonlyMap<string, string>): string | undefined {
  if (!creature) return undefined;
  return trophies.get(creature) ?? trophies.get(CREATURE_ICON_ALIAS[creature] ?? '') ?? CREATURE_ITEM_ICON[creature];
}

export const VEGVISIR_KEY = 'vegvisir';
export const itemKey = (code: string) => `item:${code}`;

/// Everyday forage and props: on a location's card they only crowd out what matters.
const HIDDEN_PICKUPS = new Set([
  'Pickable_Branch', 'Pickable_Stone', 'Pickable_StoneRock', 'Pickable_Mushroom', 'Pickable_Dandelion',
  'Pickable_Thistle', 'Pickable_Fiddlehead', 'Pickable_SmokePuff', 'Pickable_GlowWorm', 'VineAsh',
  'RaspberryBush', 'BlueberryBush', 'CloudberryBush', 'LingonberryBush', 'hanging_hairstrands',
]);
/// Smashable things worth showing (most just drop wood, stone or feathers).
const SHOWN_SMASH = new Set(['blackmarble_altar_crystal', 'Charred_altar_bellfragment']);

/// Chest items rarer than this are left off the card unless the admin shows them.
export const RARE_ITEM_CHANCE = 0.02;

/// The code default for a card entry, before admin overrides. `chance`: for a
/// chest item, how likely the chest is to hold it.
export function defaultContentVisible(key: string, cat: PoiContentsCatalog | null, chance?: number): boolean {
  if (key.startsWith('item:')) return chance == null || chance >= RARE_ITEM_CHANCE;
  if (key === VEGVISIR_KEY) return true;
  const obj = cat?.objects[key];
  if (!obj) return true;
  if (obj.kind === 'smash') return SHOWN_SMASH.has(key);
  if (obj.kind === 'pickup') return !HIDDEN_PICKUPS.has(key);
  return true;
}

/// Whether a location prefab's card shows an entry: its own override, then the
/// all-locations one, then the code default.
export function contentVisible(prefab: string | undefined, key: string, cat: PoiContentsCatalog | null,
                               chance?: number): boolean {
  const cfg = getPoiConfig().contents;
  return (prefab ? cfg[prefab]?.[key] : undefined) ?? cfg['*']?.[key] ?? defaultContentVisible(key, cat, chance);
}

// Starred entries adorn the POI's map icon at the deepest zooms (poiAdorn.ts).
// The admin's stars live with the show/hide choices, under "star:<entry>".

export const starKey = (key: string) => `star:${key}`;
const DEFAULT_STARRED = new Set([VEGVISIR_KEY]);

/// The code default for starring a card entry, before admin overrides.
export function defaultContentStarred(key: string): boolean {
  return DEFAULT_STARRED.has(key);
}

/// Whether a card entry adorns this location prefab's map icon: its own
/// override, then the all-locations one, then the code default.
export function contentStarred(prefab: string | undefined, key: string): boolean {
  const cfg = getPoiConfig().contents;
  const k = starKey(key);
  return (prefab ? cfg[prefab]?.[k] : undefined) ?? cfg['*']?.[k] ?? defaultContentStarred(key);
}

/// Everything a location prefab can hold: its own objects, plus (dungeons) any
/// of its rooms' objects, which have no fixed count ("max" null).
export function possibleContents(prefab: string | undefined, cat: PoiContentsCatalog | null):
  { objects: Record<string, { max: number | null; chance: number }>; vegvisirs: string[] } {
  const out: Record<string, { max: number | null; chance: number }> = {};
  const vegvisirs = new Set<string>();
  const loc = prefab ? cat?.locations[prefab] : undefined;
  if (!cat || !loc) return { objects: out, vegvisirs: [] };
  for (const [p, o] of Object.entries(loc.objects)) out[p] = { ...o };
  loc.vegvisirs?.forEach(v => vegvisirs.add(v));
  for (const r of loc.rooms ?? []) {
    const room = cat.rooms[r];
    if (!room) continue;
    for (const p of Object.keys(room.objects)) if (!(p in out)) out[p] = { max: null, chance: 0 };
    room.vegvisirs?.forEach(v => vegvisirs.add(v));
  }
  return { objects: out, vegvisirs: [...vegvisirs] };
}

/// Item codes a chest or smashable object can hold.
export function tableItems(obj: ContentObject): DropItem[] {
  if (obj.table) return obj.table.items;
  if (obj.item) return [{ item: obj.item, chance: 1, min: 1, max: 1 }];
  return [];
}

export const KIND_LABELS: Record<ContentKind, string> = {
  chest: 'Chest', pickup: 'Pickup', item: 'Loose item', enemy: 'Enemy', spawner: 'Spawner',
  smash: 'Smash for loot', beehive: 'Beehive',
};
