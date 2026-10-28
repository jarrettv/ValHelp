// Worlds generated in this browser, kept on this device (IndexedDB: a world is
// ~6 MB, past what localStorage holds). Two stores: `meta` (small, for listing)
// and `data` (the vector map, forest texture and POIs, read only to show one).
//
// LOCAL_WORLD_LIMIT caps the worlds kept on a device; cached copies of worlds
// pinned to the account (api WorldsPins) don't count against it.

import { useEffect, useState } from 'react';
import type { PoiMarker } from '../components/poiIcons';
import type { WorldgenStage } from './worldgenTypes';

/** Worlds a device keeps (may grow for premium users). */
export const LOCAL_WORLD_LIMIT = 4;

/** Bump when the worldgen output changes: older stored worlds stay listed and are
 *  regenerated when opened. 2: forest mask made opaque (format 1 lost the forest). */
const FORMAT = 2;

const DB_NAME = 'vh-worlds';
const DB_VERSION = 1;

export interface LocalWorldMeta {
  seed: string;
  seedHash: number;
  createdAt: number;
  openedAt: number;
  pois: number;
  bytes: number;
  totalMs: number;
  timings: Partial<Record<WorldgenStage, number>>;
  rulesVersion: string;
  format: number;
}

export interface LocalWorldData {
  bvec: ArrayBuffer;
  mask: Blob;
  pois: PoiMarker[];
}

interface StoredData { seed: string; bvec: ArrayBuffer; mask: Blob; pois: Blob /* gzipped JSON */ }

let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbP ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'seed' });
      if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'seed' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// Listeners for useLocalWorlds (this tab) and other tabs (BroadcastChannel).
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vh-local-worlds') : null;
channel?.addEventListener('message', () => listeners.forEach(l => l()));
function changed() { listeners.forEach(l => l()); channel?.postMessage('changed'); }

/** The worlds on this device, most recently opened first (older formats too: they regenerate on open). */
export async function listLocalWorlds(): Promise<LocalWorldMeta[]> {
  const d = await db();
  const all = await done(d.transaction('meta').objectStore('meta').getAll()) as LocalWorldMeta[];
  return all.sort((a, b) => b.openedAt - a.openedAt);
}

/** A stored world's map data, null if there's none, or 'stale' if it's from an older worldgen
 *  (regenerate it). Marks it opened. */
export async function getLocalWorld(seed: string): Promise<{ meta: LocalWorldMeta; data: LocalWorldData } | 'stale' | null> {
  const d = await db();
  const tx = d.transaction(['meta', 'data']);
  const [meta, data] = await Promise.all([
    done(tx.objectStore('meta').get(seed)) as Promise<LocalWorldMeta | undefined>,
    done(tx.objectStore('data').get(seed)) as Promise<StoredData | undefined>,
  ]);
  if (!meta || !data) return null;
  if (meta.format !== FORMAT) return 'stale';
  const pois = JSON.parse(await gunzip(data.pois)) as PoiMarker[];
  touch(seed).catch(() => {});
  return { meta, data: { bvec: data.bvec, mask: data.mask, pois } };
}

async function touch(seed: string) {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  const store = tx.objectStore('meta');
  const meta = await done(store.get(seed)) as LocalWorldMeta | undefined;
  if (meta) store.put({ ...meta, openedAt: Date.now() });
  await committed(tx);
}

export interface SaveWorld {
  seed: string; seedHash: number; bvec: ArrayBuffer; mask: Blob; pois: PoiMarker[];
  timings: Partial<Record<WorldgenStage, number>>; rulesVersion: string;
}

export async function saveLocalWorld(w: SaveWorld): Promise<LocalWorldMeta> {
  const pois = await gzip(JSON.stringify(w.pois));
  const now = Date.now();
  const meta: LocalWorldMeta = {
    seed: w.seed, seedHash: w.seedHash, createdAt: now, openedAt: now, pois: w.pois.length,
    bytes: w.bvec.byteLength + w.mask.size + pois.size,
    totalMs: Object.values(w.timings).reduce((a, b) => a + (b ?? 0), 0),
    timings: w.timings, rulesVersion: w.rulesVersion, format: FORMAT,
  };
  const d = await db();
  const tx = d.transaction(['meta', 'data'], 'readwrite');
  tx.objectStore('data').put({ seed: w.seed, bvec: w.bvec, mask: w.mask, pois } satisfies StoredData);
  tx.objectStore('meta').put(meta);
  await committed(tx);
  changed();
  return meta;
}

export async function deleteLocalWorld(seed: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['meta', 'data'], 'readwrite');
  tx.objectStore('meta').delete(seed);
  tx.objectStore('data').delete(seed);
  await committed(tx);
  changed();
}

/** The worlds on this device (null while loading), kept current as they change in any tab;
 *  re-read whenever `refresh` changes (e.g. a menu opening). */
export function useLocalWorlds(refresh?: unknown): LocalWorldMeta[] | null {
  const [worlds, setWorlds] = useState<LocalWorldMeta[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => listLocalWorlds().then(w => { if (alive) setWorlds(w); }, () => { if (alive) setWorlds([]); });
    load();
    listeners.add(load);
    return () => { alive = false; listeners.delete(load); };
  }, [refresh]);
  return worlds;
}
