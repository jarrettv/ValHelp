/// <reference lib="webworker" />
// The seed finder's worker (several run at once, driven by seedScanner.ts): the
// boss pass of seedgen's BossScan through the WebAssembly worldgen. 'screen' is
// the quick biome estimate for a batch of seeds (tens of ms each), 'exact' the
// game's boss placement for one seed (~10 s), with the traders' camps.

import { loadWorldgenExports } from './wasmRuntime';
import { BOSSES, type Altar, type SeedFinderMessage, type SeedFinderRequest } from './seedFinder';

declare const self: DedicatedWorkerGlobalScope;

interface Exports {
  ScanBosses(): string;
  ScanScreen(seedName: string, halfWidthCenter: number, halfWidthEdge: number, halfWidthPolar: number): number[];
  ScanExact(seedName: string): string;
}

let checked: Promise<Exports> | null = null;

/** The runtime, after checking it reports bosses in the order the page expects. */
function exports(): Promise<Exports> {
  checked ??= loadWorldgenExports<Exports>().then(ex => {
    const theirs = ex.ScanBosses(), ours = BOSSES.map(b => b.prefab).join(',');
    if (theirs !== ours) throw new Error(`worldgen boss list differs (${theirs}): rebuild with scripts/build_worldgen_wasm.sh`);
    return ex;
  });
  return checked;
}

function post(msg: SeedFinderMessage) { self.postMessage(msg); }

async function run(req: SeedFinderRequest) {
  const ex = await exports();
  const t = performance.now();
  if (req.type === 'screen') {
    const results = req.names.map(name => ({ name, chance: Array.from(ex.ScanScreen(name, req.corridor.center, req.corridor.edge, req.corridor.polar)) }));
    post({ type: 'screened', job: req.job, results, ms: performance.now() - t });
  } else {
    const raw = ex.ScanExact(req.name);
    const altars: Altar[] = raw ? raw.split(';').map(s => { const [p, x, z] = s.split(','); return [p, +x, +z]; }) : [];
    post({ type: 'exact', job: req.job, name: req.name, altars, ms: performance.now() - t });
  }
}

self.onmessage = (e: MessageEvent<SeedFinderRequest>) => {
  run(e.data).catch(err => post({ type: 'error', job: e.data.job, message: err instanceof Error ? err.message : String(err) }));
};
