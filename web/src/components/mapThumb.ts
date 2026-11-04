// Small fogged map pictures for the runs list: the world as the character has
// explored it, cut to their explored area, with where they last logged out.
//
// VectorMap (lib/vector-map.js) is one WebGL renderer shared by the page, so
// thumbnails are drawn one at a time into a detached canvas, copied out as an
// image, and the renderer torn down. A full map opening meanwhile waits for the
// one being drawn (thumbsIdle) and the rest are dropped (cancelThumbs).

import '../lib/vector-map.js';
import { Fog, parseTiles } from './charFog';
import { worldToUnit } from './poiLayer';

const WORLD_M = 2048 * 12;      // the unit square of worldToUnit, in metres
const MIN_SPAN_M = 2500;        // never zoom in closer than this across
const PAD_M = 500;

export interface ThumbRequest {
  characterId: number; worldId: number; seed: string; snapshotId: number;
  at: { x: number; z: number } | null; size: number;
}

// By request; an entry made before the last cancelThumbs is only reused once it
// has a picture (a dropped one resolves to null).
const cache = new Map<string, { gen: number; done: boolean; p: Promise<string | null> }>();
let chain: Promise<unknown> = Promise.resolve();
let generation = 0;

/** A data: URL of the picture, or null when the world's map isn't available. */
export function mapThumb(r: ThumbRequest): Promise<string | null> {
  const key = `${r.characterId}:${r.worldId}:${r.snapshotId}:${r.size}`;
  const hit = cache.get(key);
  if (hit && (hit.done || hit.gen === generation)) return hit.p;
  const gen = generation;
  const p = chain.then(() => (gen === generation ? render(r) : null)).catch(err => {
    console.warn('[mapThumb]', err);
    return null;
  });
  chain = p;
  const entry = { gen, done: false, p };
  cache.set(key, entry);
  p.then(url => { if (url) entry.done = true; else if (cache.get(key) === entry) cache.delete(key); });
  return p;
}

/** Drop the thumbnails not started yet (the list went away). */
export function cancelThumbs() { generation++; }

/** Resolves once no thumbnail is being drawn, so a full map can take the renderer. */
export function thumbsIdle(): Promise<void> {
  return chain.then(() => undefined, () => undefined);
}

async function render(r: ThumbRequest): Promise<string | null> {
  const status = await fetch(`/api/char/worlds/${r.worldId}/map`).then(res => res.ok ? res.json() : null);
  if (status?.status !== 'done') return null;
  const res = await fetch(`/api/char/${r.characterId}/worlds/${r.worldId}/tiles`);
  if (!res.ok) return null;
  const fog = new Fog(parseTiles(await res.arrayBuffer()));
  fog.seek(r.snapshotId);
  const b = fog.bounds();
  if (!b) return null;

  const vm = window.VectorMap;
  const gl = document.createElement('canvas');
  const seed = encodeURIComponent(r.seed);
  await vm.init(gl, r.seed, `/api/worlds/${seed}`, `/api/track/map/${seed}/forest`);
  try {
    const fogCanvas = document.createElement('canvas');
    fog.paint(fogCanvas);
    vm.setFog(fogCanvas, 1);

    const grid = vm.getGridSize();
    const span = Math.max(MIN_SPAN_M, b.x1 - b.x0 + 2 * PAD_M, b.z1 - b.z0 + 2 * PAD_M);
    const [cu, cv] = worldToUnit((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const scale = r.size / ((span / WORLD_M) * grid);
    const panX = r.size / 2 - cu * grid * scale, panY = r.size / 2 - cv * grid * scale;
    vm.render(scale, panX, panY, r.size, r.size);

    const out = document.createElement('canvas');
    out.width = gl.width;
    out.height = gl.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(gl, 0, 0);   // same task as the draw, so the WebGL buffer is still there
    if (r.at) {
      const dpr = out.width / r.size;
      const [ux, uy] = worldToUnit(r.at.x, r.at.z);
      const x = (panX + ux * grid * scale) * dpr, y = (panY + uy * grid * scale) * dpr;
      ctx.beginPath();
      ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeStyle = '#ffb347';
      ctx.stroke();
    }
    return out.toDataURL('image/png');
  } finally {
    vm.destroy();
  }
}
