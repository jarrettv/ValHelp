# Deep North (Valheim 1.0) — Content Extraction & Site Update

Tracking the work to pull the 1.0 / Deep North content out of the game files and
get it onto the site. Written as we go; check boxes as things land.

- **Game build:** Valheim 1.0, Unity 6000.0.75f1, installed 2026-09-09
- **Bundles:** `…/Valheim/valheim_Data/StreamingAssets/SoftRef/Bundles`
  (items `c4210710`, icons `6a33a62` — both IDs survived the update)
- **Pipeline:** `ValHelpTools/Scripts/extract_items.py` (UnityPy) → `vhcli/data/items.db`
  → `Scripts/export_web_data.py` → `web/public/data/vh/items.json` + `icons.db`

Re-running the whole thing after a game patch is now:

```
py Scripts/extract_items.py       # ~10 min, rescans every bundle
py Scripts/export_web_data.py
py Scripts/extract_locations.py   # only if POIs may have moved
```

---

## Status

| Area | State |
|---|---|
| Locate 1.0 game files | done |
| Deep North localization discovered | done |
| `extract_items.py` updated for 1.0 | done |
| `extract_locations.py` (new) | done |
| `export_web_data.py` (new) | done |
| Deep North POIs in `LocationFinder.cs` | done |
| items.json regenerated | done (917 items + 120 pieces) |
| Weapons / Gear / Food / Comfort / Enemies | flow from items.json |
| Spoiler tiers (`itemBiome.ts`) | done — see below |
| POI icons (`poiIcons.ts`) | done (borrowed art) |
| Workstation upgrades (`biomeSheets.ts`) | done |
| Bestiary category + guide placeholder | done |
| Guide docs (`web/public/data/vh/docs/*.md`) | placeholder only |

## What changed in the tools

### `Scripts/extract_items.py`
1. **`load_localization()` now discovers localization assets** instead of using a
   hardcoded list. It was missing `localization_deepnorth` (1401 entries) and
   `localization_warriortitles`, so every 1.0 item came out as a raw `$item_...`
   key. Went from 4189 to 5761 entries. Platform ports (`_xbox`, `_ps`,
   `_switch`, `_platformspecific`) and `_captions` are skipped by name.
2. **stdout is forced to UTF-8.** Printing the `★` in the spawn-level note
   killed the whole run under a redirected (cp1252) stdout — latent until the
   new creatures gave it something to print.
3. **`ITEM_TYPE` 22 was wrong.** It read as `Trinket`, which is why the two new
   summoning staves (Northern Vengeance, Spirit Caller) landed on the *armour*
   page. It is the off-hand staff type; `StaffSkeleton` had a hand-written
   special case in `classify_page` working around exactly this, now removed.
   Added type 23 (turret ammo).
4. **`FW_` / `SP_` prefabs are excluded.** The Fallen Warrior and the Shadow
   carry their own copies of ordinary player gear (`FW_ArmorBronzeChest` is the
   Bronze Plate Tunic), which put **53 duplicate rows** on the weapon and armour
   pages.
5. Deep North creatures added to `CREATURE_BIOME` / `BOSSES` / `MINI_BOSSES`,
   with display-name overrides — bestiary went from 71 to **93 entries**.
6. Deep North stations added to `WORKSTATION_PREFABS`: `piece_FrostKiln`
   (Frigid Kiln), `piece_FrostFoundry` (Frost Foundry), `cauldron_ext7_smoker`
   (Smoker) — 17 to 20.
7. **`COMFORT_GROUPS` 7-11 were unmapped** and rendering as `Unknown(8)`:
   ItemStand, Ornament, Garland, Lantern, Bathing.
8. Oven-baked Deep North foods added to `STONE_OVEN_ITEMS`; new
   `cookedSource`/`feastSource` entries in `item_overrides.json`.
9. Unfinished prefabs excluded (`IceShoes`, `IceSkates`, `SnowballBig`,
   `TrophyDeerWhite`) — the game ships them with no English name at all.

### `web/src/guides/vh/itemBiome.ts` — the spoiler leak

Reported from the site: content was visible regardless of the spoiler slider.
It was worse than just the new biome — **483 of 933 items were ungated**, across
every biome, Bronze Plate Tunic and Wolf Fur Cape included.

Three separate causes, in order of blast radius:

1. **The `Upgrader*` idols.** 1.0 put an upgrade idol (`Upgrader3Armor` and so
   on, eight tiers of each) into nearly every recipe. `buildItemBiomes` treats
   an ingredient it cannot place as a reason to give up on the whole item —
   sensible on its own, since guessing shallow would leak a late item into an
   early list. But an item it gives up on gets no entry, `itemBiomeIndex`
   returns `null` for it, and **`null` was never gated**. So one unlisted
   ingredient silently un-gated half the site. The idols are now derived from
   their tier (which skips Ocean: 0→Meadows … 7→Deep North).

2. **The moulds.** Every `Mold*` is Deep North loot with no recipe of its own,
   and every Nord weapon and armour piece is cast from one — so the entire Nord
   tier was unplaceable and therefore ungated. Matched by prefix now, since the
   set grows with each mould.

3. **Missing raw materials.** The Deep North ones (Bloodgold, Timberwood, moose
   and seal drops, the Jotnar drops, the ancient gemstones…), plus a set that
   predates 1.0 and had *always* been ungated — the ores and scraps, the seeds,
   Ectoplasm, the Hildir keys.

And the fix that makes the class of bug non-recurring: **the fallback now fails
closed.** Anything still unplaced takes the deepest ingredient we do know, and
if we know nothing at all it is treated as fully spoilery. A gap in the tables
above now hides too much rather than too little, which is the right direction
for a spoiler system to be wrong in.

Result: **0 items ungated** (was 483), 224 items correctly gated at Deep North,
and a sane spread across the rest: 99 Meadows / 113 Black Forest / 18 Ocean /
76 Swamp / 73 Mountain / 76 Plains / 116 Mistlands / 131 Ashlands.

Six items fall all the way through to fully-gated — HelmetRootCrown, CandleWick,
CharcoalResin, FishAnglerRaw, Pot_Shard_Green, Lantern_hooded. All are 1.0
additions whose source nobody has confirmed; they're named in a comment in the
file so they're easy to promote once someone pins them down.

### Workstation upgrades

`extract_workstations` now also picks up **station extensions** — the upgrade
pieces you place beside a station to raise its level. They're found by
component, not by name: a `StationExtension` holds a reference to the station it
upgrades, so the pairing comes from the game rather than a list that goes stale.
All 26 land in `items.db` as `type: "StationExtension"` with an `extends` field.

Three are new in 1.0, all Deep North, and all three are now on the station pages:

| Piece | Station | Cost |
|---|---|---|
| Smoker | Cauldron | Bloodgold 5, Timberwood 6 |
| Smith's Aprons | Black Forge | Bloodgold 5, Timberwood 8, Moose Hide 2 |
| Standing Loom | Galdr Table | Timberwood 5, Nornathread 10 |

Two things fell out of doing it from the data:

- **The Artisan Press had the wrong prefab code.** `biomeSheets.ts` called it
  `piece_artisanstation_ext1`; the actual prefab is `artisan_ext1`. That's why
  its card had a comment saying no icon had been extracted — the icon was never
  missing, the code was just wrong.
- **Station icons now come from the `Piece` component's own `m_icon`** instead
  of guessing that the prefab name matches a sprite name. Extensions with icons
  went from 7 of 26 to **26 of 26**, and every workstation now has one too.

The hand-written costs in `biomeSheets.ts` were checked against the extracted
recipes: all 26 match the game exactly, and every extension in the game is now
listed on a station page.

Note the two new Deep North stations — Frigid Kiln and Frost Foundry — do
**not** get station pages. Nothing uses them as a `Recipe` station; like the
smelter and windmill they're converters, and `STATION_PAGES` deliberately only
lists stations with a craftable list.

### Deep North on the site

`BonusDeepNorth.png` (which was sitting unused in `web/public/img/Bonus/`) is
copied to `web/public/data/vh/BiomeDeepNorth.png` — the path `biomeIconUrl()`
expects. It's 256×256 RGBA like the other biome art, so it drops straight in.

That one file lights up four places at once, because they all read
`SPOILER_BIOMES[].icon`, which was `null` for Deep North:

- the big spoiler slider on the guides landing page (it was drawing a fallback
  snowflake — the `SnowflakeIcon` stays, but only as a guard for the next biome
  added before its art exists),
- the compact slider in the top bar,
- the biome sheet cycler,
- the biome cards on the Articles page.

Then, explicitly:

- **Bestiary** — a `Deep North` tag in `enemiesConfig`, gated at
  `spoilerBiome: 'deepnorth'`, listing **21 creatures** at
  `/guides/enemies/deep-north`.
- **Guide** — a `biome_deepnorth.md` placeholder in the same shape as the
  Ashlands and Mistlands stubs, plus its row in `ArticlesPage`'s `BIOMES`. It
  uses the biome art rather than a boss trophy render, because `renders.db`
  predates 1.0 and has no Deep North mobs — `/api/mob/...` would 404.

Two bestiary data bugs surfaced while checking the new category, both fixed at
the source in `extract_items.py`:

- **Krigen was listed twice.** `JotunWarriorDualWield` is a weapon-loadout
  variant of `JotunWarrior` — same name, same 1300 HP, no trophy of its own — so
  it only ever produced a duplicate row. Dropped from `CREATURE_BIOME`.
- **Kall Fimbulbringer wasn't flagged as a boss** while the mini-bosses around
  it were. The `boss` flag was only applied to trophy-derived entries, and the
  final boss has no trophy. Synthetic entries now take the game's own `m_boss`,
  falling back to the explicit `BOSSES`/`MINI_BOSSES` sets. Checked across every
  biome: 17 boss-flagged entries, no regressions.

### Item icons moved into `icons.db`

Item icons used to ship as ~1000 loose PNGs under `web/public/data/vh/icons/`,
served statically by `iconUrl()`. Unity re-compresses its sprite atlas on most
game patches, and because that compression is lossy, re-extracting rewrote
**527 of them with visually identical images** — mean pixel difference under
`2/255`. Every game update produced a 500-file diff in which the handful of real
additions were unreviewable.

They now live in a single `icons.db`, the same shape `renders.db` already used
for creature portraits, served by `api/ModuleStuff/StuffEndpointsIcon.cs`:

    GET api/icon/<code>.png

- 1020 icons, 6.4 MB, one file — down from 8.0 MB across 1020 tracked files.
- `data.ts`'s `iconUrl()` and the 26 hardcoded paths in `vhRender.raw.ts` now
  point at `/api/icon/`. Biome art (`Biome<Name>.png`) is still static.
- `item-icons.json` is gone. Nothing on the site ever read it — it mapped to
  `/data/icons/…`, which isn't even the path `iconUrl()` used — and it's only
  vhcli's own local tool that wants that data, from its own `/api/item-icons`.
- The deploy already does `cp -r dist/* ../api/wwwroot/`, so `icons.db` lands at
  `wwwroot/data/vh/icons.db` — one of the paths the endpoint resolves, same as
  `renders.db`.

Rebuilding drops and recreates the file, then `VACUUM`s it, so a given set of
icons produces a stable file rather than one carrying free pages from the last
build.

### `Scripts/extract_locations.py` (new)
Dumps every `_LocationList_*` and `_ZoneSystem` POI config out of bundle
`d59cfac` — **216 locations across 7 lists** — so `LocationFinder.cs` can be
checked against the game rather than hand-transcribed.

Two traps it documents:
- `m_prefabName` is a **stale editor field**. Every Deep North entry claims to be
  `TarPit1`. The real identity is `m_name`, which is what the game hashes and
  what `LocationFinder` already keys on.
- There are **two** radial gates and they are easy to transpose.
  `m_minDistance`/`m_maxDistance` is the distance-from-centre gate the bosses
  and traders use (it maps to `LocationConfig.MinDistCenter/MaxDistCenter`);
  `m_minDistanceFromCenter`/`m_maxDistanceFromCenter` is a second one that only
  a few entries set — the frozen ships sit in an 8000-9750 ring.

### `Scripts/export_web_data.py` (new)
Writes `items.json`, `item-icons.json` and `icons/*.png` into
`web/public/data/vh` straight from `items.db`, so a game update is two commands
rather than lifting files off a running `vh serve`. Also deletes orphaned icons.

---

## What 1.0 adds (from `localization_deepnorth`, 1401 entries)

The Deep North localization TextAsset is **not** loaded by the current
`load_localization()` — its `loc_names` set is hardcoded and predates 1.0. That
is the first thing to fix, or every new item comes out as a raw `$item_…` key.

Key counts in that file: 481 `item_*`, 356 `piece_*`, 110 `ach_*`, 35 `enemy_*`,
30 `shadowperson_*`, 25 `lore_*`, 22 `npc_*`.

### Boss
- **Kall Fimbulbringer** (`frozenking`, phase 3 variant `frozenking_p3`) — drops
  Sacrificial Blood.

### Creatures
Barka, Frysling, Elaking, Eyeless One (`elakingmole`), Moose + Moose Calf, Seal +
Baby Seal, Gammeltroll (`trollfrost`), Krigen (`jotun_warrior`), Hexen
(`jotun_witch`), Shadow (`shadowperson`), Shapeless/Tiny/Hexahedric Pulp
(`blobmork`, `blobmorkmini`, `bigblob`), Fallen Warrior, Imprisoned Dvergr,
Captive Fuling, The Void (`ghost_void`).

Plus seven **Aspects** — rematch forms of every earlier boss (Aspect of the
Lightning Stag / Living Forest / Writhing Dead / Dragon Mother / Twisted Soul /
Crawling Matriarch / Emerald Flame).

### Materials
Bloodgold (`item_gold`), Petrified Tissue (gold ore), Timberwood + Timberwood
Cone, Frostcore, Frysling Core, Liquid Frost, Malicious Blood, Moose
Hide/Sinew/Meat, Seal Pelt/Blubber, Nornathread, Elaking Hair Bundle, Long
Claws, Ice, Snowball, Luminous Larva, Dead Pulp, Embers, Memorial Coal,
Frostfire Essence, Thunderblood Essence, four Ancient Gemstones (Draumyx,
Grimvarn, Solryth, Veydris), Ancient Coin, Mysterious Rock.

### Weapons — the "Nord" tier, cast from moulds
A full Bloodgold weapon set, each in three variants (plain **Nord**, **Frostfire**,
**Thunderblood**), each with a `Mould:` item and a `Cast:` intermediate:
sword, greatsword, axe, greataxe, mace, sledge, atgeir, spear, dagger,
knucklechains, bow, crossbow, buckler, shield, greatshield.
Staves: Northern Vengeance, Echo Spike, Lightning Strike, Spirit Caller.
Also Voidcaller (knife), Bloodgold Arrow/Bolt/Missile/Payload, Ember Charge,
Blob Bomb: Pulp, Grappling Hook, Snow Shovel, Salvaged Lantern.

### Armour — three sets
Protector (heavy), Vanguard (medium), Caller (mage) — helmet/chest/legs each,
plus Moose Hide Cape and Cape of the Caller. Trinkets: Neckstabber, Witch Crown.

### Food
Kale + Kale Chips, Oats → Oat Flour / Oat Milk / Oatmeal, Poteitr (+ Baked,
Seed), Lingonberries + Lingonberry Juice, Moose Meat (cooked/smoked), Meat In
Bread, Seal Blubber (cooked), Seal Meat Soup, Fish Soup, Smoked Fish, Pancakes,
Oven Pancake, Meatballs and Poteitr, Northern Morning Fare (feast), Seasoning of
the Gourd.

---

## Deep North POIs

`_LocationList_DeepNorth` holds 25 entries; 18 are enabled. Added to
`seedgen/WorldGen/LocationFinder.cs` with the game's own numbers:

| Location | Display | Qty | Notes |
|---|---|---:|---|
| `bosslocation` | Kall Fimbulbringer | 3 | prioritized, altitude 80+, 1024 apart |
| `morkborg` | Mörkhalla | 40 | altitude 30+, terrain delta up to 300 |
| `NorthVillage` | Northern Village | 135 | the common one |
| `hut01` | Northern Hut | 40 | altitude 40+ |
| `thehole01` | Winding Tunnels | 40 | the dungeon entrance |
| `Lumbercamp` | Lumber Camp | 50 | inForest |
| `NorthMemorialPlace` | Ancestral Memorial | 15 | rare; the offering altar |
| `icepond` | Ice Pond | 40 | inForest, altitude 10-200 |
| `FrozenShip01/02/03` | Frozen Ship | 50 ea | 8000-9750 from centre, below sea level |
| `Shipwreck_DN`, `Shipwreck02_DN` | Shipwreck | 170 / 120 | shoreline |
| `Runestone_DeepNorth` | Deep North Runestone | 70 | |
| `BearCave` | Bear Cave | 50 | **Black Forest**, not Deep North |

Shipped disabled, so not added: `darkesthole` ("The Hole"), `hotspring{,2,3}`,
`HalfBurried_ForestCrypt`, `FimbulLocation01`. Also skipped: `shipsetting` (x2)
and `DN_gammeltrollFrac01/02`, which are scenery rather than POIs.

Two that are worth knowing about: **`BearCave` is a Black Forest location that
1.0 ships inside the Deep North list**, and the frozen ships are the only
locations in the game gated on `m_minDistanceFromCenter`.

## Open questions
- **Worldgen version.** `LocationFinder` replicates `ZoneSystem.GenerateLocations`,
  and nothing here has been validated against a 1.0-generated world — there is no
  world on this machine created since the update. If 1.0 bumped `WorldGenVersion`,
  Deep North terrain (and therefore every POI position, old biomes included)
  would shift. **Generate a world in 1.0 and diff seedgen's output against it
  before trusting any placement.**
- Deep North POIs have no icon art; `poiIcons.ts` borrows the nearest existing
  SVG and leans on colour. `IcePond` and `LumberCamp` render nothing at all.
- `MarkerDataBuilder.cs` in vhcli is a stale mirror of `poiIcons.ts` — it never
  got the Ashlands types either, and hasn't been given the Deep North ones.
- `FaderEmber` ("Embers"): only used by Deep North recipes and only present in
  `localization_deepnorth`, but named after the Ashlands boss. Gated at Deep
  North for now.
- No Deep North entry in `biomeSheets.ts` yet, so the biome sheet cycler skips it.
- Do the `Cast:`/`Mould:` items belong on the crafting pages, or should they be
  filtered like other intermediates? They currently sit under Materials.
- Aspects are **not** separate bestiary entries — the prefabs live under
  `Characters/FrozenKing/BossAspects/`, so they are phases of the Kall
  Fimbulbringer fight, not standalone creatures.
