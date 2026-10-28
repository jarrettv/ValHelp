// Runs worldgenWorker.ts for one seed at a time. The worker (and the .NET
// runtime it loads, ~1 s) is kept for the next seed; cancelling terminates it.

import type { WorldgenMessage, WorldgenStage } from './worldgenTypes';
import type { PoiMarker } from '../components/poiIcons';

export interface GenerateProgress { stage: WorldgenStage; fraction: number; detail?: string }

export interface GeneratedWorld {
  seed: string; seedHash: number; bvec: ArrayBuffer; mask: Blob; pois: PoiMarker[];
  timings: Partial<Record<WorldgenStage, number>>; rulesVersion: string;
  altBiomes: string; altBiomeGrid: Blob;
}

let worker: Worker | null = null;
let busy: (() => void) | null = null;

/** Generate a seed's world in a Web Worker. Starting another cancels this one. */
export function generateWorld(seed: string, onProgress: (p: GenerateProgress) => void): { result: Promise<GeneratedWorld>; cancel: () => void } {
  busy?.();
  let settled = false;
  let reject!: (e: Error) => void;
  const result = new Promise<GeneratedWorld>((res, rej) => {
    reject = rej;
    worker ??= new Worker(new URL('./worldgenWorker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    w.onmessage = (e: MessageEvent<WorldgenMessage>) => {
      const m = e.data;
      if (m.type === 'progress') { if (!settled) onProgress(m); return; }
      settled = true;
      busy = null;
      if (m.type === 'error') rej(new Error(m.message));
      else res({ seed: m.seed, seedHash: m.seedHash, bvec: m.bvec, mask: m.mask, pois: m.pois, timings: m.timings, rulesVersion: m.rulesVersion,
        altBiomes: m.altBiomes, altBiomeGrid: m.altBiomeGrid });
    };
    w.onerror = e => {
      settled = true;
      busy = null;
      worker?.terminate();
      worker = null;
      rej(new Error(e.message || 'The world generator failed to load'));
    };
    w.postMessage({ type: 'generate', seed });
  });
  const cancel = () => {
    if (settled) return;
    settled = true;
    busy = null;
    worker?.terminate();
    worker = null;
    reject(new Error('cancelled'));
  };
  busy = cancel;
  result.catch(() => {});
  return { result, cancel };
}
