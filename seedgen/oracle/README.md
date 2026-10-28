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
| `oracle.rivers.bin.gz` | gzip binary — the river network: lakes, rivers, streams and every river point per 64 m cell (`WriteRivers` documents the layout) |

Layout matches the game: row-major, `index = i*2048 + j`, `i` the north axis so
row 0 is the **south** edge, `world = (k − 1024)·12 + 6`.

The Perlin fixture stores its **inputs alongside its outputs** so a comparer never
has to reproduce the input generator — one less thing to get subtly wrong. Inputs
deliberately mix fine fractional steps with the large magnitudes worldgen actually
feeds Perlin (coords offset by up to ±10000), so it exercises integer-boundary and
precision-loss behaviour rather than just `[0,1)`.

## Regression tests

`seedgen/Vh.WorldGen` (the terrain code shared by seedgen and the browser build)
is checked against these dumps bit for bit by `seedgen/Vh.WorldGen.Tests`:

```
scripts/oracle_fixtures.sh JVModsFun NewDNTest ...   # boot the game per seed, save its dumps
dotnet test seedgen/Vh.WorldGen.Tests                 # Perlin, river network, 2048² height/biome/forest
dotnet build seedgen/Vh.WorldGen.Wasm -c Release && node seedgen/Vh.WorldGen.Wasm/check-oracle.mjs
```

The fixtures (`Vh.WorldGen.Tests/oracle-fixtures/`, gitignored) record the game
version; re-make them after a Valheim update. Matching took modelling how the
game's code runs under Mono, not just what it says: float expressions in Unity
code are evaluated in double and rounded only when stored, and in one place
(`GetDeepNorthHeight`) a float local is read back unrounded. Comments in
`WorldGenerator.cs`, `Vector2.cs`, `UnityRandom.cs` and `FastNoise.cs` mark each case.

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

## Camps (farms)

Every camp the game's CampRadial generator builds (farms `WoodFarm1`, villages
`WoodVillage1/2`, Deep North villages `NorthVillage`, Fuling camps `GoblinCamp2(_1)`,
`AshlandRuins`, `FortressRuins`) lays its rooms out on the zone's terrain, so on oracle jobs (or with
`VALHELP_LOOT_DUNGEONS=1`) the plugin builds each one's **whole zone** through
`ZoneSystem.SpawnZone`, terrain first, the way a player's arrival does. Their
`oracle.loot.json` entries carry `"wholeZone":true`, the generated `rooms` (a
village's `northvillage_granary` is one), and `marks`: where each maypole
(`piece_maypole`, a 10% roll per farm yard room) ended up.

seedgen predicts the same thing without the game (`WorldGen/DungeonSim.cs` +
`WorldGen/ZoneTerrain.cs`) and is checked against such a dump with:

```
dotnet run -- dungeon-check <oracle.loot.json> <SeedName>          # layouts, generator seeds, maypoles/granaries
dotnet run -- pois-check <db> <SeedName> <oracle.loot.json>        # the Maypole/Granary POIs a normal job emits
```

`VALHELP_LOOT_ONLY=WoodFarm1` (or `NorthVillage`) limits sampling to those. `VALHELP_LOG_GROUND=1`
adds every `GetGroundData` probe made while a farm's zone generates (position
and normal) as `ground`, for finding where the simulated terrain disagrees.

## Location contents

Seedgen fills each POI's `contents` (how many of each chest, enemy spawner,
pickup...) by re-running the location's spawn rolls in `DungeonSim`, for every
location, not just dungeons. To check that against the game, `VALHELP_LOOT_ALL=1`
samples **every** location instance (camps with their whole zone), then:

```
dotnet run -- contents-check <data dir>...    # dir/seed<hash>/oracle.loot.json; per prefab, instances that match exactly
```

`VALHELP_LOOT_ROTATE=90` spawns every sampled location turned that far. The game
picks a location's rotation from Unity's unseeded global Random, so this shows
what depends on it: plain locations, camps and dungeons with an interior slot
match unrotated; crypts and sunken crypts (no interior slot, rooms turn with the
location) don't, and seedgen gives them no contents.

A full sweep overruns a job's 10-minute server timeout, so split it with
`VALHELP_LOOT_ONLY` (plain locations, camps, dungeons). Which objects count as
contents, and what they hold, comes from `scripts/export_poi_contents.py`.
