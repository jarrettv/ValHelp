// A seed's whole map (generator, 2048² textures, compressed vector map) through
// the WebAssembly build, timed, the way a browser would make it on one thread.
//
//   dotnet publish seedgen/Vh.WorldGen.Wasm -c Release
//   node seedgen/Vh.WorldGen.Wasm/map-time.mjs <SeedName> [out.bvec]
//
// The bvec is byte-for-byte what seedgen serves for the seed (compare with
// `dotnet run --project seedgen -- map-bvec <SeedName> <file>`).
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dotnetJs = join(here, 'bin', 'Release', 'net9.0', 'publish', 'wwwroot', '_framework', 'dotnet.js');
if (!existsSync(dotnetJs)) { console.error('publish first: dotnet publish seedgen/Vh.WorldGen.Wasm -c Release'); process.exit(2); }
const [seedName = 'JVModsFun', out] = process.argv.slice(2);

const t0 = performance.now();
const { dotnet } = await import(pathToFileURL(dotnetJs).href);
const runtime = await dotnet.create();
const ex = (await runtime.getAssemblyExports('Vh.WorldGen.Wasm.dll')).Vh.WorldGen.Wasm.Exports;
const tReady = performance.now();
let stages = '';
const view = ex.MapBvec(ex.SeedHash(seedName), 2, t => { stages = t; });
const bvec = view.slice();
view.dispose();
const [gen, tex, vec] = stages.split(',').map(Number);
console.log(`${seedName}: runtime ${((tReady - t0) / 1000).toFixed(1)}s, generator ${(gen / 1000).toFixed(1)}s, ` +
  `textures ${(tex / 1000).toFixed(1)}s, vectors ${(vec / 1000).toFixed(1)}s; ` +
  `total ${((performance.now() - t0) / 1000).toFixed(1)}s, bvec ${bvec.length.toLocaleString()} bytes`);
if (out) writeFileSync(out, bvec);
process.exit(0);
