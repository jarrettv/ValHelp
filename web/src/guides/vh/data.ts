import { useQuery } from '@tanstack/react-query';
import type { VhItem } from './types';

export const VH_DATA_BASE = '/data/vh';

// Item icons come from icons.db via the API, not from static files — see
// api/ModuleStuff/StuffEndpointsIcon.cs. Biome art below is still static.
export const iconUrl = (code: string) =>
  `/api/icon/${encodeURIComponent(code)}.png`;

export const biomeIconUrl = (name: string) =>
  `${VH_DATA_BASE}/Biome${name}.png`;

export const docUrl = (name: string) => `${VH_DATA_BASE}/docs/${name}.md`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

// One fetch per page load, shared by the hook and non-React callers (map canvas).
let vhItemsLoad: Promise<VhItem[]> | null = null;
export function fetchVhItems(): Promise<VhItem[]> {
  vhItemsLoad ??= fetchJson<VhItem[]>(`${VH_DATA_BASE}/items.json`)
    .catch(err => { vhItemsLoad = null; throw err; });
  return vhItemsLoad;
}

export function useVhItems() {
  return useQuery({
    queryKey: ['vh-items'],
    queryFn: fetchVhItems,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/// Things players build or use that aren't inventory items, so items.json
/// doesn't list them, but guides and runs name them. Icons are in icons.db.
export const EXTRA_ITEMS: readonly VhItem[] = [
  { code: 'smelter',            name: 'Smelter',              category: 'Workstation' },
  { code: 'blastfurnace',       name: 'Blast furnace',        category: 'Workstation' },
  { code: 'eitrrefinery',       name: 'Eitr refinery',        category: 'Workstation' },
  { code: 'piece_beehive',      name: 'Beehive',              category: 'Workstation' },
  { code: 'piece_sapcollector', name: 'Sap extractor',        category: 'Workstation' },
  { code: 'portal_wood',        name: 'Portal',               category: 'Misc' },
  { code: 'portal_stone',       name: 'Stone Portal',         category: 'Misc' },
  { code: 'Karve',              name: 'Karve',                category: 'Misc' },
  { code: 'VikingShip',         name: 'Longship',             category: 'Misc' },
  { code: 'PlayerUnarmed',      name: 'Bare fists',           category: 'Weapon' },
  { code: 'TurretBoltWood',     name: 'Wooden missile',       category: 'Ammo' },
  { code: 'TurretBolt',         name: 'Black metal missile',  category: 'Ammo' },
  { code: 'TurretBoltFlametal', name: 'Flametal missile',     category: 'Ammo' },
];

export type VhDefaults = { favorites?: string[]; speedrun?: string[] };

export type VhPrefsCode = 'favs' | 'speedruns';
export type VhPrefsSection = { items: string[]; at: string | null };

export async function fetchPrefsSection(code: VhPrefsCode): Promise<VhPrefsSection | null> {
  const res = await fetch(`/api/auth/prefs/${code}`, { credentials: 'include' });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`prefs ${code} GET ${res.status}`);
  return res.json();
}

async function savePrefs(code: VhPrefsCode, items: string[]): Promise<VhPrefsSection> {
  const res = await fetch('/api/auth/prefs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, items }),
  });
  if (!res.ok) throw new Error(`prefs ${code} POST ${res.status}`);
  return res.json();
}

export const saveFavs = (items: string[]) => savePrefs('favs', items);
export const saveSpeedRuns = (items: string[]) => savePrefs('speedruns', items);

export function useVhDefaults() {
  return useQuery({
    queryKey: ['vh-defaults'],
    queryFn: () => fetchJson<VhDefaults>(`${VH_DATA_BASE}/defaults.json`),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useVhDoc(name: string) {
  return useQuery({
    queryKey: ['vh-doc', name],
    queryFn: async () => {
      const res = await fetch(docUrl(name));
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      return res.text();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
