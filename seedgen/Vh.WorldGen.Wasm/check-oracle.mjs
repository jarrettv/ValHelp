// The WebAssembly build of Vh.WorldGen against the game, bit for bit: the same
// oracle fixtures and checks as Vh.WorldGen.Tests (OracleTests.cs), but run
// through the .NET WebAssembly runtime, whose maths library isn't the server's.
//
//   dotnet publish seedgen/Vh.WorldGen.Wasm -c Release
//   node seedgen/Vh.WorldGen.Wasm/check-oracle.mjs [fixture-dir] [--rows N]
//
// fixture-dir defaults to VALHELP_ORACLE_FIXTURES or
// seedgen/Vh.WorldGen.Tests/oracle-fixtures; --rows checks only the first N
// rows of each grid (quicker). Fixtures with an oracle.locations.json also get
// location placement checked (every placed location, bit for bit; ~25 s a seed,
// --no-locations skips it). Exit code 1 on any difference.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rowsArg = args.indexOf('--rows');
const maxRows = rowsArg >= 0 ? Number(args.splice(rowsArg, 2)[1]) : 2048;
const noLocations = args.includes('--no-locations');
if (noLocations) args.splice(args.indexOf('--no-locations'), 1);
const root = args[0] ?? process.env.VALHELP_ORACLE_FIXTURES ?? join(here, '..', 'Vh.WorldGen.Tests', 'oracle-fixtures');
const SIZE = 2048, BAND = 128;

// The AOT build (dotnet publish) is what browsers get; a plain build runs interpreted, ~100x slower.
const published = join(here, 'bin', 'Release', 'net9.0', 'publish', 'wwwroot', '_framework', 'dotnet.js');
const built = join(here, 'bin', 'Release', 'net9.0', 'wwwroot', '_framework', 'dotnet.js');
const dotnetJs = existsSync(published) ? published : built;
if (!existsSync(dotnetJs)) { console.error('publish first: dotnet publish seedgen/Vh.WorldGen.Wasm -c Release'); process.exit(2); }
if (dotnetJs === built) console.warn('note: using the interpreted build; dotnet publish for the AOT one');
const { dotnet } = await import(pathToFileURL(dotnetJs).href);
const runtime = await dotnet.create();
const ex = (await runtime.getAssemblyExports('Vh.WorldGen.Wasm.dll')).Vh.WorldGen.Wasm.Exports;

const fixtures = existsSync(root)
  ? readdirSync(root).filter(d => existsSync(join(root, d, 'oracle.height.f32.gz'))).sort()
  : [];
if (!fixtures.length) { console.error(`no oracle fixtures under ${root}; make some with scripts/oracle_fixtures.sh`); process.exit(1); }

const gz = (dir, f) => gunzipSync(readFileSync(join(dir, f)));
const f32 = buf => new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const bits = new Uint32Array(1), fl = new Float32Array(bits.buffer);
const ulps = (a, b) => {   // float32 steps between two values, from their bit patterns
  const ia = new Int32Array(new Float32Array([a]).buffer)[0], ib = new Int32Array(new Float32Array([b]).buffer)[0];
  const ma = ia < 0 ? -2147483648 - ia : ia, mb = ib < 0 ? -2147483648 - ib : ib;
  return Math.abs(ma - mb);
};

class Diff {
  constructor(name) { this.name = name; this.count = 0; this.maxUlp = 0; this.examples = []; }
  float(k, want, got, what) {
    if (Object.is(want, got) || (want === got && want !== 0)) return;
    const u = ulps(want, got);
    if (u === 0) return;
    this.maxUlp = Math.max(this.maxUlp, u);
    this.add(k, `game ${want}, ours ${got} (${u} ulp)`, what);
  }
  add(k, detail, what) {
    if (this.count++ < 5) {
      const i = Math.floor(k / SIZE), j = k % SIZE;
      this.examples.push(`    ${what ?? `cell (${i},${j}) world (${(j - 1024) * 12 + 6},${(i - 1024) * 12 + 6})`}: ${detail}`);
    }
  }
  report() {
    return this.count === 0 ? `  ${this.name}: exact`
      : `  ${this.name}: ${this.count.toLocaleString()} differ${this.maxUlp ? `, worst ${this.maxUlp} ulp` : ''}\n${this.examples.join('\n')}`;
  }
}

let failed = false;
for (const name of fixtures) {
  const dir = join(root, name);
  const meta = JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
  const t0 = Date.now();

  const perlin = new Diff('perlin');
  const t = f32(gz(dir, 'oracle.perlin.f32.gz'));
  for (let k = 0; k < t.length / 3; k++) {
    fl[0] = ex.Perlin(t[k * 3], t[k * 3 + 1]);   // JS numbers are doubles: round back to float32
    perlin.float(k, t[k * 3 + 2], fl[0], `PerlinNoise(${t[k * 3]}, ${t[k * 3 + 1]})`);
  }

  const wantH = f32(gz(dir, 'oracle.height.f32.gz')), wantB = gz(dir, 'oracle.biome.u8.gz'), wantF = f32(gz(dir, 'oracle.forest.f32.gz'));
  const biome = new Diff('biome'), height = new Diff('height'), forest = new Diff('forest');
  for (let r0 = 0; r0 < maxRows; r0 += BAND) {
    const r1 = Math.min(maxRows, r0 + BAND), n = (r1 - r0) * SIZE, base = r0 * SIZE;
    const view = ex.GridRows(meta.seed, meta.worldGenVersion ?? 2, r0, r1);
    const bytes = view.slice();
    view.dispose();
    const h = new Float32Array(bytes.buffer, 0, n), b = bytes.subarray(n * 4, n * 5), f = new Float32Array(bytes.buffer, n * 5, n);
    for (let k = 0; k < n; k++) {
      if (wantB[base + k] !== b[k]) biome.add(base + k, `game ${wantB[base + k]}, ours ${b[k]}`);
      height.float(base + k, wantH[base + k], h[k]);
      forest.float(base + k, wantF[base + k], f[k]);
    }
  }

  const diffs = [perlin, biome, height, forest];

  // Location placement, the way the browser runs it (Web Worker path: MapStart, MapRows, Locations*).
  if (!noLocations && existsSync(join(dir, 'oracle.locations.json'))) {
    const locations = new Diff('locations');
    ex.MapStart(meta.seed, meta.worldGenVersion ?? 2);
    for (let r = 0; r < SIZE; r += 256) ex.MapRows(r, r + 256);
    ex.LocationsStart();
    while (ex.LocationsRun(1000) < 1) { /* placing */ }
    const placed = JSON.parse(ex.LocationsJson());
    const game = JSON.parse(readFileSync(join(dir, 'oracle.locations.json'), 'utf8')).instances;
    const bitsOf = f => new Int32Array(new Float32Array([f]).buffer)[0];
    const gameSet = new Set(game.map(([p, x, , z]) => `${p}|${x}|${z}`));
    const ourSet = new Set(placed.map(([p, x, z]) => `${p}|${bitsOf(x)}|${bitsOf(z)}`));
    for (const k of ourSet) if (!gameSet.has(k)) locations.add(0, `ours only: ${k}`, 'placed');
    for (const k of gameSet) if (!ourSet.has(k)) locations.add(0, `game only: ${k}`, 'placed');
    diffs.push(locations);
  }
  const ok = diffs.every(d => d.count === 0);
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (seed ${meta.seed}, worldGen ${meta.worldGenVersion}, game ${meta.gameVersion}, ${maxRows} rows) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const d of diffs) console.log(d.report());
}
process.exit(failed ? 1 : 0);
