# Generating maps in the browser

Mini report, 2026-10-25. Question: could anyone generate a seed's map on their
own CPU in the browser, while the home server (seedgen) keeps generating event
maps?

**Short answer:** yes, and most of the code already exists in C#. The one big
missing piece is **location placement**: today it comes from booting a real
Valheim server, not from our code. Porting it is the bulk of the work (weeks,
not days) and the main risk. The rest is packaging.

## Status (2026-10-25)

Phase 1, terrain, is done:
- **Shared code:** `seedgen/Vh.WorldGen` holds the terrain code; seedgen and the
  WebAssembly build (`seedgen/Vh.WorldGen.Wasm`) both use it.
- **Regression tests:** `seedgen/Vh.WorldGen.Tests` checks it against the game's
  own output (`scripts/oracle_fixtures.sh`). See `seedgen/oracle/README.md`.
- **Accuracy:** the 2048² height, biome and forest grids and the river network are
  bit-exact for every fixture seed, on Windows and Linux .NET and in WebAssembly.
- **Speed in the browser:** compiled ahead of time (`wasm-tools-net9` workload,
  `RunAOTCompilation`), a fresh seed's whole map (generator, textures, vector map)
  takes ~17 s on one thread: generator 1 s, textures 9 s, vectors 7 s, about 1.5×
  native. The vector map is byte-identical to seedgen's. Download ~2 MB brotli.
  Interpreted it was ~110× slower.

Phase 2, location placement, is done too (2026-10-26):
- **Port:** `seedgen/Vh.WorldGen/Locations`. `BiomeData` holds the biome sectors
  and alt biomes (the game's AltBiomeWorldData); `LocationPlacer` places the
  locations (ZoneSystem.GenerateLocations). The placement rules ship in the
  library (`Data/locations.json`, from `scripts/export_location_rules.py`).
- **Accuracy:** sectors, alt biomes and all ~12,300 placed locations per seed are
  bit-exact against the game on every fixture seed, natively and in WebAssembly.
- **Async:** `LocationPlacer.Run(budget)` works for a time slice and reports
  `Progress` (and the type being placed), like the game's own time-sliced
  coroutine. The server runs it to the end; the browser worker posts progress
  between slices.
- **Speed:** in the browser, a whole seed (terrain + locations) takes ~24 s on
  one thread: terrain ~10 s, locations ~14 s.
- **Dev page:** `/auth/worldgen` (admin) does all of it in a Web Worker and shows
  the result on the map, with a byte/position comparison against the server.

Phase 3, location contents, works in the browser too (2026-10-26):
- **Port:** the contents code (`LocationFinder`, `DungeonSim`, `DungeonCatalog`,
  `ZoneTerrain` and their data) moved into `seedgen/Vh.WorldGen/Contents`, shared
  by the server and the browser. `LocationFinder.FromPlaced`/`AddPlaced` turn our
  placed locations into POIs exactly as `ReadFromWorldDb` does for the game's.
- **Accuracy:** for JVModsFun, all 12,414 matched POIs hold the same contents and
  vegvisirs as the server's. The two extra are TarPit3_1, which the server can't
  name.
- **Speed:** ~11 s in the browser, after making the catalogue's tree types
  classes. As record structs, LINQ over them made Mono's WebAssembly AOT fall back
  to its interpreter (78 s).
- **Dev page:** shows the full POI card (hover or click), filtered by the admin's
  contents config.
- **Not in the browser:** exact chest items and other loot the game rolled (the
  oracle's samples). The card shows chest odds instead.

A whole seed in the browser: ~36 s on one thread (terrain ~9 s, locations ~16 s,
contents ~11 s).

Parallelism (not needed for correctness, not done yet):
- Textures: rows are independent, so splitting them across 3–4 Web Workers
  should save ~3–4 s.
- Placement is sequential by nature: each location type sees the zones taken
  before it, and how many random draws an attempt makes depends on which checks
  pass. Profile the per-attempt work first (GetBiome/GetHeight, the 10 terrain
  samples per point). Speculative parallel attempts are possible but complex.
- The Unity RNG state is per thread (`[ThreadStatic]`), so separate seeds can
  already be generated in parallel.

How to check it:

```
scripts/oracle_fixtures.sh <seeds>                         # ground truth from the game
dotnet test seedgen/Vh.WorldGen.Tests                      # server code vs the game
dotnet publish seedgen/Vh.WorldGen.Wasm -c Release         # browser build (AOT, ~2.5 min)
node seedgen/Vh.WorldGen.Wasm/check-oracle.mjs             # browser build vs the game
node seedgen/Vh.WorldGen.Wasm/map-time.mjs <seed> [out]    # time a whole map in the browser build
dotnet run --project seedgen -- map-bvec <seed> <out>      # the same map from the server code
```

## What a seedgen job does today

One job takes **~65 s** on the server (Ryzen 5 7600X, seed `hLlZ5vaE3I`).

| Step | Runs where | Needs the game? | In-browser outlook |
|---|---|---|---|
| Boot a headless Valheim dedicated server; the game places every location and saves `_main.db2` | Valheim + BepInEx | **Yes** | **Must be ported** (see below) |
| Oracle plugin: spawns each location and records chest loot, vegvisirs, camp layouts (`oracle.loot.json`) | Valheim plugin | Yes | Can't: show odds instead (the card already does when there's no sample) |
| Oracle plugin: alt-biome sectors (`oracle.altbiomes.json`) | Valheim plugin | Yes, today | Portable: clients recompute them on every world load, so they're deterministic from the seed |
| Read POIs from the `.db2`, simulate contents (`LocationFinder`, `DungeonSim`, `CampRadial`, `ZoneTerrain`) | C# | No | Reuse as is |
| Biome, height and forest textures, 2048² (`ArtifactGenerator`) | C# | No | Reuse as is: **2.1 s** single-threaded on the server |
| Vector map (`BiomeExtractor` + `BvecCompressor`) | C# | No | Reuse as is: **~1.5 s** |

Most of the 65 s is the game itself (boot, location generation, then the plugin
spawning ~12k locations for loot). How much of that is location generation alone
hasn't been measured; that's the first thing to find out.

Already in hand:
- `seedgen/WorldGen/WorldGenerator.cs` reproduces the game's heights and biomes,
  validated against the oracle's `height`, `biome` and `forest` dumps.
- `LocationFinder.FindLocations`/`GenerateLocation` is an **old, unused partial
  port** of the game's placement loop. It covers bosses and Meadows only, so it's a
  starting point, not a solution.
- `../valheim-old-stuff/vhmap-rs` is a Rust port of the world generator and
  minimap (~2.2k lines; no locations; no WASM build).
- Embedded data is small: `dungeons.json.gz` 1.4 MB, `contents.json` 10 KB.

## The hard part: location placement

The game's `ZoneSystem.GenerateLocations` is deterministic from the seed: each
location type seeds Unity's RNG with `worldSeed + hash(prefab)` and tries up to
100k–200k random zones. It's still a sizeable port, though:

- **Every location type and its rules** has to come from the game's assets (a
  `scripts/export_*` exporter, like the dungeon room catalogue). The rules include
  biome, biome area, altitude, forest factor, terrain delta, distance from the
  centre, minimum distance from similar or same-group locations, priority order
  and quantity.
- **Placement order matters**, because each type sees the zones taken by those
  placed before it. So it's sequential and hard to parallelise.
- **1.0 alt biomes block some locations**, so the alt-biome assignment has to be
  ported first (`BIOME_VARIANTS.md`). That means a flood fill over the 2048² grid
  plus the game's shuffle.
- **It must be bit-exact.** Placement checks compare floats against thresholds
  (heights, biome edges), so the port needs the game's 32-bit float behaviour.
  C# and Rust have that natively. JavaScript doesn't (it would need `Math.fround`
  on every operation), which is the main reason **not** to port to TypeScript.
- **Each Valheim patch can change it.** The game warns of this itself, and
  valheim-map.world asks owners of older worlds to upload their world file for full
  accuracy. A port needs re-checking after each update. The server path can't
  drift, because it *is* the game.

Validation is the easy part: the server already produces ground truth for any
seed, and `pois-check` compares POIs against a `.db2`. A port can be checked
against hundreds of seeds automatically.

Prior art: **valheim-map.world** simulates worlds, Deep North included, from a
seed in the browser, locations and all. It's a closed-source Unity build, so
there's nothing to reuse, but it shows the approach is feasible and fast enough
for users.

## Options

| | **A. .NET WebAssembly** (reuse seedgen's C#) | **B. Rust → WASM** (grow vhmap-rs) | **C. TypeScript port** | **D. Server only, scaled up** |
|---|---|---|---|---|
| Code reuse | All of `WorldGen` + `Rendering`, one source shared with the server | Terrain only; the rest rewritten | None | All |
| Exact float math | Native `float` | Native `f32` | Hard (`Math.fround` everywhere) | n/a |
| Speed | Good with AOT (~1.5–3× native); slow if interpreted | Best (~1–1.5× native) | Medium | Server-bound |
| Download | ~2–4 MB runtime (trimmed, brotli) + data | ~0.5–1 MB + data | Smallest | 0 |
| Maintenance | One implementation | Two (C# server + Rust browser) | Two | One |
| Users' CPU | Yes | Yes | Yes | No |

**D** isn't what you asked for. It's listed because the cheapest fallback is
caching plus a public queue on the existing server.

**Not recommended:** a Unity WebGL build around the game's own assemblies. It
would mean redistributing Iron Gate's code, and the download would be hundreds of
MB.

## Recommendation: A, and port placement on the server first

1. **Spike (2–3 days).**
   - Compile `WorldGen` + `Rendering` for `browser-wasm` with `[JSExport]` entry
     points, and run them in a Web Worker.
   - Measure the texture and bvec time with and without AOT, and the download size.
   - Measure how long the game spends in `GenerateLocations` (the plugin can log it).
2. **Port location placement in C#, on the server (1–3 weeks).**
   - Write an exporter for the location list and rules, and finish `GenerateLocation`.
   - Port the alt-biome assignment.
   - Gate it in CI against the real-server output for many seeds, aiming for an
     exact match.
   - Useful even without the browser: non-event maps could skip booting Valheim.
3. **Browser generation (about a week).**
   - A "Generate in my browser" button runs the same engine in a worker. It
     produces the same artifacts in memory: `bvec`, mask, `pois`, alt biomes.
   - `WorldMap` already takes a `baseUrl`/`poisUrl` override, so it can read them
     from blob URLs.
   - Cache the results in IndexedDB.
   - Optionally, let the user upload the result to share it.
4. **The server stays the source of truth.**
   - Event maps keep the full Valheim path: exact chest loot, and a guarantee
     that matches the game.
   - A scheduled job compares the browser engine with the server on a few seeds
     after every Valheim update, and flags when they drift apart.

### What browser maps won't have
- **Exact chest contents.** The game rolls them when a location spawns; the card
  shows odds instead, as it already does for unsampled POIs.
- **The game's own confirmation.** Results should be labelled "simulated" until
  checked against the current game build.
- **Burial chamber / sunken crypt contents.** Same as the server today: they depend
  on the location's rotation.

### Risks and open questions
- **Placement time in WASM.** Placement is sequential and runs millions of
  terrain samples. Caching per-zone biome and height should help; the spike will
  tell. A progress bar of a minute or so is likely acceptable.
- **Patch drift.** Each Valheim update means re-exporting and re-validating; the
  drift check above catches it.
- **Game data in the browser.** We already ship derived data
  (`poi-contents.json`, icons); location rules are more of the same.
- **Mobile.** Multi-MB WASM and high memory use; phones may be better served by
  the server's cached maps.

Sources: [valheim-map.world](http://valheim-map.world/) (in-browser seed
viewer, supports Deep North, notes on version reshuffles),
[Inverse interview with its creator](https://inverse.com/gaming/valheim-map-seed-viewer-world-generator-interview)
(built in Unity, "generation is very fragile and could change in every update"),
[PCGamesN](https://www.pcgamesn.com/valheim/map-generator).
