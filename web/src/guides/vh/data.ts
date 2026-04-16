import { useQuery } from '@tanstack/react-query';
import type { VhItem } from './types';

export const VH_DATA_BASE = '/data/vh';

export const iconUrl = (code: string) =>
  `${VH_DATA_BASE}/icons/${encodeURIComponent(code)}.png`;

export const biomeIconUrl = (name: string) =>
  `${VH_DATA_BASE}/Biome${name}.png`;

export const docUrl = (name: string) => `${VH_DATA_BASE}/docs/${name}.md`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useVhItems() {
  return useQuery({
    queryKey: ['vh-items'],
    queryFn: () => fetchJson<VhItem[]>(`${VH_DATA_BASE}/items.json`),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export type VhDefaults = { favorites?: string[]; speedrun?: string[] };

export type VhPrefsSection = { items: string[]; at: string };
export type VhPrefs = {
  favs?: VhPrefsSection;
  speedRuns?: VhPrefsSection;
  [key: string]: unknown;
};

export async function fetchPrefs(): Promise<VhPrefs | null> {
  const res = await fetch('/api/auth/prefs', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`prefs GET ${res.status}`);
  return res.json();
}

export async function savePrefs(prefs: VhPrefs): Promise<VhPrefs> {
  const res = await fetch('/api/auth/prefs', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`prefs PUT ${res.status}`);
  return res.json();
}

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
