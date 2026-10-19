# Biome variants (alt biomes)

Reference for Valheim 1.0's **alt biomes**: variants laid over whole patches of a biome
("Mushroom", "Dandelion Meadows", "Wolf Mountain", ...). They add or block vegetation,
spawns, locations and weather. Extracted from the game's `AltBiomeList` asset and its code
(`AltBiome`, `AltBiomeWorldData`, `BiomeSector`), current game build.

## How the game places them

1. **Grid.** The world is sampled on the 2048×2048 minimap grid (12 m per cell). Each cell
   gets `GetBiome` and its height (`GetBiomeHeight`).
2. **Sectors.** Connected cells of the same biome form a *sector* (4-way flood fill). Every
   Ash Lands cell is one sector, as is every Deep North cell and every Ocean cell.
3. **Sector stats:**
   - **edge**: the number of the sector's cells that border another sector, so a size measure;
   - **centre**: the average position of those edge cells;
   - **height**: the average of the min and max height along the edge;
   - **neighbours**: the sectors it touches;
   - **distance**: centre to the world centre.
4. **Assignment** (`GenerateAltBiomes`), for each biome and then each variant valid for it:
   - **Order:** shuffle the biome's sectors, then go through them in that order.
   - **Accept:** a sector takes the variant when two things hold:
     - (fewer than *min* placed so far, *or* a roll ≤ *chance*);
     - and the sector passes the rules: distance, edge size, height, map quadrant, neighbours, compatibility.
   - **Stop** once *max* sectors have the variant.
   - **Stacking:** a sector can carry several variants, unless they're marked incompatible.
5. **When it runs:** at every world load, on the server and on each client. The result isn't
   saved; the game's `*_biomedatacache.bin` holds only the grid's biome and height.

**Deterministic.** The shuffle uses an unseeded `System.Random`, but in practice placement is
stable. Two separate server boots of the same seed placed all 71 variant sectors identically
(NewDNTest, 2026-10-17). Treat the game as the source of truth: the oracle plugin writes
`oracle.altbiomes.json` on every job (`DumpAltBiomes` in `seedgen/oracle/OraclePlugin.cs`).
Don't port the shuffle.

Defaults for every variant unless noted: enabled, average height 30 to 10000 m, no
map-quadrant limits.

## Variants

Columns:
- **Chance**: the per-sector roll after *min* is met.
- **Count**: min and max sectors per world.
- **Dist**: minimum distance from the world centre, in metres.
- **Edge**: sector edge size, from min (inclusive) to max (exclusive).
- **Lvl×**: multiplier on creature level-up (star) chance.

| Variant | Biome | Chance | Count | Dist | Edge | Lvl× |
|---|---|---|---|---|---|---|
| Mushroom | Meadows, Black Forest | 0.2 | 1–3 | 500 | 66–199 | |
| Lantern | all but Ash Lands, Ocean | 0.2 | 3–5 | 500 | 66–199 | |
| Bones | Swamp, Plains, Mistlands | 0.2 | 1–3 | 2000 | 66–199 | |
| Menhir | Meadows, Plains | 0.2 | 1–3 | 750 | 33–199 | |
| Dark Meadows | Meadows | 0.5 | 2–5 | 1900 | 66–299 | 2 |
| Peaceful Meadows | Meadows | 0.2 | 1–2 | 1000 | 99–299 | |
| Dandelion Meadows | Meadows | 0.2 | 1–3 | 500 | 66–199 | |
| Raspberry Meadows | Meadows | 0.2 | 1–3 | 500 | 66–199 | |
| Smalltree Meadows | Meadows | 0.2 | 1–3 | 500 | 33–199 | |
| Birch Meadows | Meadows | 0.2 | 1–3 | 500 | 66–199 | |
| Troll Black Forest | Black Forest | 0.2 | 1–3 | 750 | 66–199 | |
| Root Black Forest | Black Forest | 0.2 | 1–4 | 2000 | 99–299 | |
| Ruin Black Forest | Black Forest | 0.2 | 1–5 | 500 | 33–199 | |
| Rock Black Forest | Black Forest | 0.2 | 1–5 | 750 | 33–199 | 2 |
| Pinetree Black Forest | Black Forest | 0.2 | 1–5 | 750 | 33–199 | 2 |
| Blueberry Black Forest | Black Forest | 0.2 | 1–5 | 500 | 33–199 | |
| Kalhygge Black Forest | Black Forest | 0.2 | 1–2 | 500 | 20–80 | |
| Hut Swamp | Swamp | 0.2 | 1–3 | 1500 | 33–199 | |
| Bog Swamp | Swamp | 0.2 | 1–5 | 1500 | 33–145 | |
| Bat Swamp | Swamp | 0.2 | 1–3 | 2000 | 33–145 | |
| Abomination Swamp | Swamp | 0.2 | 1–3 | 2000 | 66–145 | |
| Wolf Mountain | Mountain | 0.2 | 1–5 | 2000 | 199–299 | 2 |
| Drake Mountain | Mountain | 0.2 | 1–3 | 2000 | 199–299 | 2 |
| Fortress Mountain | Mountain | 0.2 | 1–2 | 2000 | 199–299 | 3 |
| Lox Plains | Plains | 0.2 | 0–1 | 2000 | 99–299 | |
| Goblin Plains | Plains | 0.2 | 0–2 | 2000 | 66–199 | 2 |
| Death Plains | Plains | 0.2 | 0–1 | 1000 | 99–299 | 2 |
| Rockless Mistlands | Mistlands | 0.2 | 2–5 | 2000 | 99–599 | |
| Trees Mistlands | Mistlands | 0.2 | 1–5 | 2000 | 59–299 | |
| Swords Mistlands | Mistlands | 0.2 | 1–3 | 2000 | 59–199 | |
| Hare Mistlands | Mistlands | 0.2 | 1–3 | 2000 | 59–199 | |
| BroodSwarm Mistlands | Mistlands | 0.2 | 1–3 | 2000 | 59–199 | |

None of the variants sets a name prefix, suffix or override, a neighbour rule, a terrain
texture override, a forced environment, or forced music.

## What each adds

`+` adds, `−` blocks. **Veg** is vegetation, **Spawn** creature spawners, **Loc** locations,
**Env** weather. `✕` lists the variants it can't share a sector with.

- **Mushroom**: veg + pickable_mushroom1, pickable_mushroom2
- **Lantern**: veg + lost_lantern
- **Bones**: veg + large_bones, large_bones_half01/02 · spawn + Skeleton_poison
- **Menhir**: veg + rock_7_meadows · spawn + Skeleton_meadows, Skeleton_plains · ✕ Birch Meadows
- **Dark Meadows**:
  - loc + WoodVillage1 − WoodFarm1
  - spawn + Draugr, Draugr Elite
  - env − Clear, LightRain, DeepForest Mist
- **Peaceful Meadows**:
  - veg + fireflies
  - spawn + boar2, deer2, deerwhite
  - spawn − Greyling, Greydwarf (+ Shaman, Elite), Skeleton, Skeleton_Poison, Draugr, Draugr_Elite, Neck, Troll, Bjorn
  - ✕ Bones, Dark Meadows
- **Dandelion Meadows**: veg + pickable_dandelion2, pickable_dandelion3
- **Raspberry Meadows**: veg + raspberry_bush2
- **Smalltree Meadows**:
  - veg + beech_small3/4_meadows, stubbe2_meadows, bush02_meadows, shrub_3_meadows, beech2_meadows
  - veg − beech1_meadows, birch1/2_meadows
  - spawn + Neck lakes, Neck IN RAIN
- **Birch Meadows**: veg + birch1/2_meadows2, beech5_meadows, oak2_meadows − beech1_meadows · spawn + deer
- **Troll Black Forest**: spawn + Troll
- **Root Black Forest**:
  - veg + Greydwarf_root1, Greydwarf_Surprise
  - spawn + Root, greydwarf ELITE 2 − Skeleton
  - ✕ Rock, Kalhygge Black Forest
- **Ruin Black Forest**: veg + stone_wall ruins (2x1, 1x1, ruin, ruin_2), ghostskull · loc + StoneTowerRuins09 ×4
- **Rock Black Forest**:
  - veg + rock4_blackforest, rock_3/4_blackforest, firtree_small_blackforest2, stubbe_blackforest, firtree_blackforest2
  - veg − firtree_many_blackforest, Pinetree_01_blackforest, firtree_blackforest
  - loc − TrollCave02
  - ✕ Pinetree, Root Black Forest
- **Pinetree Black Forest**: veg + Pinetree_01_blackforest − firtree_blackforest, firtree_many/small_blackforest · ✕ Rock Black Forest
- **Blueberry Black Forest**: veg + blueberry_bush1
- **Kalhygge Black Forest** (clear-cut): veg + stubbe many, stubbe pine many − all firtree/pinetree · ✕ Root Black Forest
- **Hut Swamp**:
  - veg + swamptree3/4, wooden_path, wood pole log 4 − swamptree1/2
  - loc + SwampHut1 ×3
  - spawn + Wraith
  - ✕ Bog Swamp
- **Bog Swamp**:
  - veg + statue_evil_swamp, swamptree2_log, firtree_small_dead_swamp, swamptree5/6 − swamptree1/2
  - spawn + Abomination
  - loc − InfestedTree01
- **Bat Swamp**: spawn + Bat
- **Abomination Swamp**: spawn + Abomination
- **Wolf Mountain**: veg + firtree_mountain2 − rock1/2_mountain · spawn + Wolf − Skeleton, Hatchling · ✕ Drake, Fortress Mountain
- **Drake Mountain**: veg + rock3_mountain_1 − firtree_mountain · spawn + Hatchling − Wolf, Skeleton · ✕ Wolf, Fortress Mountain
- **Fortress Mountain**:
  - veg + stone_wall_ruin(_2), rock3_mountain_2 − firtree_mountain
  - spawn + Skeleton, StoneGolem
  - loc + StoneTowerRuins05 (and blocks the regular one)
  - ✕ Wolf, Drake Mountain
- **Lox Plains**:
  - veg − birch2_aut_heath
  - spawn + Lox − Goblin
  - loc − GoblinCamp2, StoneTower1, StoneTower3
  - ✕ Goblin, Death Plains
- **Goblin Plains**: spawn + Goblin − Lox, Deathsquito · loc + GoblinCamp2, WoodHouse1 ×3 · ✕ Lox, Death Plains
- **Death Plains**:
  - veg − birch2_aut_heath, heathrockpillar
  - spawn + Deathsquito − Lox, Goblin
  - loc + TarPit1–3 − GoblinCamp2, StoneTower1/3, StoneHenge1–3
  - ✕ Lox, Goblin Plains
- **Rockless Mistlands**: veg + cliff_mistlands3/4, rock_mistlands3, YggaShoot_small3 − cliff_mistlands1/2, rock_mistlands1
- **Trees Mistlands**: veg + YggaShoot4, YggaShoot_small2, ygga root2
- **Swords Mistlands**: veg + giant_sword1_sea, giant_sword2_sea, giant_sword3/4, giant_helmet3/4
- **Hare Mistlands**: spawn + Hare2
- **BroodSwarm Mistlands**: spawn + SeekerBroodSwarm

## On our map

Variants are defined in `web/src/components/biomePatterns.ts`. The map outlines each
sector with a stroke in its first variant's tint, plus one more stroke inside per extra
variant (up to three). The older look, a wash of the first tint under up to three
patterns (tiles in `web/public/img/Patterns`), is still behind `VARIANT_STYLE` in
`web/src/lib/vector-map.js`.

- **Patterned (17):**
  - Mushroom
  - Root Black Forest
  - Bog Swamp and Abomination Swamp (shared)
  - Dandelion, Raspberry, Birch, Smalltree and Peaceful Meadows
  - Blueberry, Pinetree, Kalhygge and Rock Black Forest
  - Bones, Menhir
  - Swords and Trees Mistlands
- **Left to their POIs:** each adds locations that already mark it on the map.
  - Goblin Plains: camps and houses
  - Death Plains: tar pits
  - Hut Swamp: swamp huts
  - Ruin Black Forest: tower ruins
  - Fortress Mountain: tower ruin
  - Dark Meadows: village
- **Tint only:** a coloured wash, no pattern.
  - The creature-only variants: Troll Black Forest, Bat Swamp, Wolf Mountain,
    Drake Mountain, Lox Plains, Hare Mistlands, BroodSwarm Mistlands.
  - Rockless Mistlands, which removes things rather than adding them.
- **Hidden:** Lantern. The game's world data places it, but it doesn't actually occur in
  real games, so the map and hover card leave it out.

## Re-extracting after a game update

Load the game's bundles with UnityPy, find the `MonoBehaviour` whose script is
`AltBiomeList` (there is one, holding all 32 in `m_alts`), and read its typetree; bundle
loading works as in `scripts/export_dungeon_rooms.py`. Where a given seed's variants are
comes from the oracle plugin's `oracle.altbiomes.json` / `oracle.altbiomes.u8.gz`.
