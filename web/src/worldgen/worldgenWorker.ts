/// <reference lib="webworker" />
// Generates a seed's map in the browser: the WebAssembly build of seedgen's
// worldgen (seedgen/Vh.WorldGen.Wasm, copied to /worldgen/ by
// scripts/build_worldgen_wasm.sh), run off the main thread. Produces what the
// map view fetches from seedgen: the compressed vector map (bvec) and the
// forest/mask texture, byte-identical to the server's.
//
// Protocol: post { type: 'generate', seed } and receive 'progress' messages,
// then 'done' (or 'error'). Stages run in order; each reports 0-1.

import type { WorldgenRequest, WorldgenMessage, WorldgenStage } from './worldgenTypes';

declare const self: DedicatedWorkerGlobalScope;

const FRAMEWORK = '/worldgen/_framework/dotnet.js';
const SIZE = 2048;
const BAND = 64;   // texture rows per call, so progress updates ~32 times
const LOCATION_SLICE_MS = 150;   // location placement per call between progress updates

interface Exports {
  SeedHash(name: string): number;
  MapStart(seed: number, worldGenVersion: number): void;
  MapRows(rowFrom: number, rowTo: number): void;
  MapVectors(): MemoryView;
  MapMask(): MemoryView;
  LocationsStart(): string;
  LocationsRun(budgetMs: number): number;
  LocationsCurrent(): string;
  LocationsJson(): string;
  ContentsStart(): void;
  ContentsRun(budgetMs: number): number;
  PoisJson(): string;
}
interface MemoryView { slice(): Uint8Array; dispose(): void }

let exportsP: Promise<Exports> | null = null;

// The runtime is a static file, not part of the bundle: an import Vite can't see,
// since its dev server rewrites dynamic imports (adds ?import), which public/ files fail.
const importStatic = new Function('url', 'return import(url)') as (url: string) => Promise<{ dotnet: DotnetHost }>;
interface DotnetHost { create(): Promise<{ getAssemblyExports(name: string): Promise<{ Vh: { WorldGen: { Wasm: { Exports: Exports } } } }> }> }

function loadRuntime(): Promise<Exports> {
  exportsP ??= (async () => {
    // dotnet.js takes a worker that already has onmessage set for one of the
    // runtime's own threads and waits forever for its setup; this flag says
    // we're a plain worker hosting the runtime ("sidecar").
    (globalThis as { dotnetSidecar?: boolean }).dotnetSidecar = true;
    const { dotnet } = await importStatic(new URL(FRAMEWORK, self.location.origin).href);
    const runtime = await dotnet.create();
    const all = await runtime.getAssemblyExports('Vh.WorldGen.Wasm.dll');
    return all.Vh.WorldGen.Wasm.Exports;
  })();
  exportsP.catch(() => { exportsP = null; });
  return exportsP;
}

function post(msg: WorldgenMessage, transfer: Transferable[] = []) { self.postMessage(msg, transfer); }

function progress(stage: WorldgenStage, fraction: number, detail?: string) { post({ type: 'progress', stage, fraction, detail }); }

/** Copy out of .NET memory, then release it. */
function take(view: MemoryView): Uint8Array {
  try { return view.slice(); } finally { view.dispose(); }
}

/** Bottom-up RGBA (row 0 = south) -> a top-down PNG, as seedgen serves forestMaskTexCache.
 *  The game's mask leaves alpha at 0 (only R forest, G mist, B lava are used). seedgen writes
 *  it as is, but a canvas stores colours premultiplied by alpha, which would zero them all
 *  (no forest on the map): so it's made opaque here. The map reads only the colour channels. */
async function maskPng(rgba: Uint8Array): Promise<Blob> {
  const flipped = new Uint8ClampedArray(rgba.length);
  const row = SIZE * 4;
  for (let y = 0; y < SIZE; y++) flipped.set(rgba.subarray(y * row, y * row + row), (SIZE - 1 - y) * row);
  for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  canvas.getContext('2d')!.putImageData(new ImageData(flipped, SIZE, SIZE), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function generate(seedName: string) {
  const timings: Record<string, number> = {};
  let t = performance.now();
  const lap = (stage: WorldgenStage) => { const now = performance.now(); timings[stage] = now - t; t = now; };

  progress('runtime', 0);
  const ex = await loadRuntime();
  lap('runtime');

  progress('generator', 0);
  const seed = ex.SeedHash(seedName);
  ex.MapStart(seed, 2);
  lap('generator');

  for (let r = 0; r < SIZE; r += BAND) {
    progress('textures', r / SIZE);
    ex.MapRows(r, Math.min(SIZE, r + BAND));
  }
  lap('textures');

  progress('vectors', 0);
  const bvec = take(ex.MapVectors());
  lap('vectors');

  progress('mask', 0);
  const mask = await maskPng(take(ex.MapMask()));
  lap('mask');

  // Locations: the game's placement, in slices so progress can be reported between them.
  progress('locations', 0);
  const rulesVersion = ex.LocationsStart();
  for (let f = 0; f < 1;) {
    f = ex.LocationsRun(LOCATION_SLICE_MS);
    progress('locations', f, ex.LocationsCurrent());
  }
  lap('locations');

  // Contents: each location's chests, enemies, finds and vegvisirs (the game's spawn rolls), and the POIs
  // as seedgen serves them.
  progress('contents', 0);
  ex.ContentsStart();
  for (let f = 0; f < 1;) {
    f = ex.ContentsRun(LOCATION_SLICE_MS);
    progress('contents', f);
  }
  const pois = JSON.parse(ex.PoisJson());
  lap('contents');

  post({ type: 'done', seed: seedName, seedHash: seed, bvec: bvec.buffer as ArrayBuffer, mask, timings, pois, rulesVersion },
    [bvec.buffer as ArrayBuffer]);
}

self.onmessage = (e: MessageEvent<WorldgenRequest>) => {
  if (e.data.type === 'generate') {
    generate(e.data.seed).catch(err => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
  }
};
