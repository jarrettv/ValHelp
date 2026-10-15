# Worldgen oracle (BepInEx plugin)

Ground truth for validating the managed worldgen reimplementation. Dumps the
**game's own** `GetBiome` / `GetBiomeHeight` / `GetForestFactor` over the
2048×2048 minimap grid, plus a `Mathf.PerlinNoise` fixture.

## Why this exists

The dedicated server never produces the minimap textures. `GenerateWorldMap()` is
only reachable from `Minimap.Update()`, which returns early when
`SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null` — guaranteed by
`-nographics` — and again when there is no main camera or local player.

So the plugin skips `Minimap` entirely and calls `WorldGenerator.instance`, which
*is* live on a server because `ZoneSystem` depends on it. That is better than
scraping the client's cache anyway: it yields **raw float32 heights** instead of
the RHalf the texture would store, which separates a worldgen/Perlin bug from a
float→half rounding bug rather than conflating them.

## Build

Needs the game's assemblies and BepInEx, so it is built on the host, not in the
image. Any Valheim install with BepInEx works (client or dedicated server):

```
dotnet build seedgen/oracle -c Release
# non-default install location:
dotnet build seedgen/oracle -c Release -p:ValheimDir=/path/to/Valheim
```

Output: `seedgen/oracle/bin/Release/ValHelpOracle.dll`. The seedgen image copies
it in and `install-bepinex.sh` drops it into `BepInEx/plugins/`. If it is absent
the image still builds and POI generation is unaffected — only oracle jobs produce
nothing, with a warning saying so.

## Run

```
curl -X POST localhost:5580/api/seedgen/regen \
     -H 'content-type: application/json' \
     -d '{"seed":"NewDNTest","oracle":true}'
```

`oracle: true` implies a full regen — the dump only exists if the server was
booted under BepInEx for that job. `SeedGenWorker` sets `DOORSTOP_ENABLE`,
`DOORSTOP_INVOKE_DLL_PATH`, `LD_PRELOAD` and `LD_LIBRARY_PATH` exactly as the
BepInEx pack's `start_server_bepinex.sh` does, plus `VALHELP_ORACLE=1` and
`VALHELP_ORACLE_DIR`. Without those variables BepInEx is inert, so installing it
costs ordinary jobs nothing.

The plugin waits for `ZoneSystem.LocationsGenerated` before sweeping — the sweep
blocks the main thread for seconds and would otherwise distort seedgen's own
timings. The worker therefore waits for `[valhelp-oracle] DONE` rather than
`Done generating locations`, with `OracleTimeoutSec` (default 300s) of extra
budget.

## Output

Collected into the seed's artifact dir and served from
`/api/v2/seed<hash>/<file>`:

| File | Contents |
|---|---|
| `oracle.json` | seed, game version, grid params, and the index layout |
| `oracle.height.f32.gz` | gzip `float32[2048²]` — `GetBiomeHeight`, raw world height |
| `oracle.biome.u8.gz` | gzip `uint8[2048²]` — dense `Heightmap.BiomeIndex` |
| `oracle.forest.f32.gz` | gzip `float32[2048²]` — `GetForestFactor` |
| `oracle.perlin.f32.gz` | gzip `float32[256·256·3]` — `(x, y, PerlinNoise(x,y))` triples |

Layout matches the game: row-major, `index = i*2048 + j`, `i` the north axis so
row 0 is the **south** edge, `world = (k − 1024)·12 + 6`.

The Perlin fixture stores its **inputs alongside its outputs** so a comparer never
has to reproduce the input generator — one less thing to get subtly wrong. Inputs
deliberately mix fine fractional steps with the large magnitudes worldgen actually
feeds Perlin (coords offset by up to ±10000), so it exercises integer-boundary and
precision-loss behaviour rather than just `[0,1)`.

## Compare

```
py scripts/compare_oracle.py <oracle-dir> --ours <dir-with-our-raw-dumps>
py scripts/compare_oracle.py <oracle-dir> --perlin-only
```

Sections are ordered so the first failure is the root cause, not a symptom:

1. **perlin** — the only native black box in the chain (`Mathf.PerlinNoise` is an
   `extern` InternalCall). If this fails nothing downstream can match, and fixing
   anything else is wasted effort.
2. **biome** — integer-valued, so it only breaks where noise crosses a threshold.
   A handful of mismatches *with* a failing perlin is a symptom, not a second bug.
3. **height** — continuous, so any noise error lands in every pixel. This is the
   one that silently broke before: an 8-bit biome map tolerates noise error that a
   float height does not, which is why the map looked right while heights were
   wrong.
4. **forest** — continuous, feeds the forest mask channel.

Height and forest diffs are reported split by ulp distance, so a `FloatToHalf`-class
rounding issue (≤1 ulp on a minority of pixels) is distinguishable from an upstream
worldgen error (large diffs, everywhere).
