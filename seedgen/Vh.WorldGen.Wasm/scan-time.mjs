// The seed finder's boss pass (BossScan) through the WebAssembly build, timed on
// one thread as a browser worker runs it: the quick screen, then the exact
// placement, with each boss's altars.
//
//   dotnet publish seedgen/Vh.WorldGen.Wasm -c Release
//   node seedgen/Vh.WorldGen.Wasm/scan-time.mjs [SeedName ...]
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dotnetJs = join(here, 'bin', 'Release', 'net9.0', 'publish', 'wwwroot', '_framework', 'dotnet.js');
if (!existsSync(dotnetJs)) { console.error('publish first: dotnet publish seedgen/Vh.WorldGen.Wasm -c Release'); process.exit(2); }
const seeds = process.argv.length > 2 ? process.argv.slice(2) : ['fun0000000'];

const { dotnet } = await import(pathToFileURL(dotnetJs).href);
const runtime = await dotnet.create();
const ex = (await runtime.getAssemblyExports('Vh.WorldGen.Wasm.dll')).Vh.WorldGen.Wasm.Exports;
const bosses = ex.ScanBosses().split(',');
for (const seed of seeds) {
  const t0 = performance.now();
  const chance = ex.ScanScreen(seed, 1000, 3000, 2000);
  const t1 = performance.now();
  const altars = ex.ScanExact(seed);
  const t2 = performance.now();
  console.log(`${seed}: screen ${(t1 - t0).toFixed(0)} ms, exact ${((t2 - t1) / 1000).toFixed(2)} s`);
  console.log('  chance ' + bosses.map((b, i) => `${b} ${chance[i].toFixed(2)}`).join(', '));
  console.log('  ' + altars);
}
process.exit(0);
