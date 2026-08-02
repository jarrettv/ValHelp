// ── Item → biome (spoiler tier) ───────────────────────────────────
// Every craftable/obtainable item gets a biome index (0 = Meadows … 8 = Deep
// North, see SPOILER_BIOMES in spoiler.ts). The item lists blur anything past
// the reader's spoiler level.
//
// Only RAW_BIOME below is hand-maintained — the ~160 things you pick up, mine,
// or loot rather than craft. Everything else is derived:
//
//   1. Anchors already in items.json — `trophyDrop.biome` (71 creature drops)
//      and `trinket.biome`.
//   2. Recipes — a crafted item is as deep as the deepest thing that goes into
//      it (its materials, its crafting station, or what it was cooked from),
//      applied repeatedly until nothing changes. Bronze needs Copper + Tin, so
//      a Bronze Sword lands in Black Forest without being listed anywhere.
//
// So: to fix a wrong biome, first check whether a RAW_BIOME entry is off — that
// usually corrects a whole branch of recipes at once. Use OVERRIDE only for
// items whose recipe genuinely doesn't reflect where you get them.

import type { VhItem } from './types';
import { BIOME_COUNT } from './spoiler';

const MEADOWS = 0, BLACKFOREST = 1, OCEAN = 2, SWAMP = 3, MOUNTAIN = 4,
  PLAINS = 5, MISTLANDS = 6, ASHLANDS = 7, DEEPNORTH = 8;

/** items.json spells biomes out; map its strings to our indexes. */
const BIOME_NAME: Record<string, number> = {
  'Meadows': MEADOWS,
  'Black Forest': BLACKFOREST,
  'BlackForest': BLACKFOREST,
  'Ocean': OCEAN,
  'Swamp': SWAMP,
  'Mountain': MOUNTAIN,
  'Mountains': MOUNTAIN,
  'Plains': PLAINS,
  'Mistlands': MISTLANDS,
  'Ashlands': ASHLANDS,
  'Deep North': DEEPNORTH,
  'DeepNorth': DEEPNORTH,
};

/** Where each crafting station first becomes available. */
const STATION_BIOME: Record<string, number> = {
  piece_workbench: MEADOWS,
  piece_cauldron: BLACKFOREST,
  forge: BLACKFOREST,
  piece_MeadCauldron: BLACKFOREST,
  piece_artisanstation: PLAINS,
  piece_preptable: SWAMP,
  blackforge: MISTLANDS,
  piece_magetable: MISTLANDS,
};

/**
 * Raw materials — gathered, mined, or looted rather than crafted. This is the
 * hand-maintained half of the system; a wrong entry here propagates to every
 * recipe using it, which is exactly what makes it worth getting right.
 */
const RAW_BIOME: Record<string, number> = {
  // ── Meadows ──
  Wood: MEADOWS, Stone: MEADOWS, Flint: MEADOWS, Feathers: MEADOWS,
  Dandelion: MEADOWS, Mushroom: MEADOWS, Raspberry: MEADOWS, Honey: MEADOWS,
  DeerHide: MEADOWS, DeerMeat: MEADOWS, RawMeat: MEADOWS, NeckTail: MEADOWS,
  LeatherScraps: MEADOWS, HardAntler: MEADOWS, Resin: MEADOWS,
  FishingBait: MEADOWS, Fish1: MEADOWS, AmberPearl: MEADOWS,
  FireworksRocket_White: MEADOWS,

  // ── Black Forest ──
  // Finewood and Corewood need a bronze axe, so they sit at Black Forest even
  // though the trees themselves grow in the Meadows.
  FineWood: BLACKFOREST, RoundLog: BLACKFOREST, FirCone: BLACKFOREST,
  Copper: BLACKFOREST, Tin: BLACKFOREST, Coal: BLACKFOREST,
  GreydwarfEye: BLACKFOREST, Guck: BLACKFOREST,
  BoneFragments: BLACKFOREST, SurtlingCore: BLACKFOREST, YmirRemains: BLACKFOREST,
  Thistle: BLACKFOREST, Blueberries: BLACKFOREST, MushroomYellow: BLACKFOREST,
  Carrot: BLACKFOREST, TrollHide: BLACKFOREST, AncientSeed: BLACKFOREST,
  BjornHide: BLACKFOREST, BjornMeat: BLACKFOREST, BjornPaw: BLACKFOREST,
  Fish2: BLACKFOREST, Fish5: BLACKFOREST,
  BarberKit: BLACKFOREST, SpiceForests: BLACKFOREST,

  // ── Ocean ──
  Chitin: OCEAN, SerpentMeat: OCEAN, SerpentScale: OCEAN, FreshSeaweed: OCEAN,
  Fish3: OCEAN, Fish6: OCEAN, Fish7: OCEAN, Fish8: OCEAN, Fish9: OCEAN,
  Fish12: OCEAN, SpiceOceans: OCEAN,

  // ── Swamp ──
  Iron: SWAMP, ElderBark: SWAMP, WitheredBone: SWAMP, Chain: SWAMP,
  Entrails: SWAMP, Ooze: SWAMP, BlobVial: SWAMP, Bloodbag: SWAMP,
  Root: SWAMP, Turnip: SWAMP, Ironpit: SWAMP,

  // ── Mountain ──
  Silver: MOUNTAIN, Obsidian: MOUNTAIN, Crystal: MOUNTAIN, Ruby: MOUNTAIN,
  FreezeGland: MOUNTAIN, DragonTear: MOUNTAIN, PowderedDragonEgg: MOUNTAIN,
  WolfPelt: MOUNTAIN, WolfMeat: MOUNTAIN, WolfFang: MOUNTAIN,
  WolfClaw: MOUNTAIN, WolfHairBundle: MOUNTAIN, Onion: MOUNTAIN,
  Fish4_cave: MOUNTAIN, SpiceMountains: MOUNTAIN,

  // ── Plains ──
  BlackMetal: PLAINS, Tar: PLAINS, Needle: PLAINS, Flax: PLAINS, Barley: PLAINS,
  LinenThread: PLAINS,
  BarleyFlour: PLAINS, Cloudberry: PLAINS, LoxMeat: PLAINS, LoxPelt: PLAINS,
  JuteRed: PLAINS, JuteBlue: PLAINS, UndeadBjornRibcage: PLAINS,
  FragrantBundle: PLAINS, SpicePlains: PLAINS, BarleyWine: PLAINS,

  // ── Mistlands ──
  BlackMarble: MISTLANDS, YggdrasilWood: MISTLANDS, Sap: MISTLANDS,
  Eitr: MISTLANDS, Carapace: MISTLANDS, ScaleHide: MISTLANDS, Wisp: MISTLANDS,
  Mandible: MISTLANDS, BugMeat: MISTLANDS, Bilebag: MISTLANDS,
  GiantBloodSack: MISTLANDS, RoyalJelly: MISTLANDS, HareMeat: MISTLANDS,
  ChickenEgg: MISTLANDS, ChickenMeat: MISTLANDS, Fiddleheadfern: MISTLANDS,
  Vineberry: MISTLANDS, MushroomMagecap: MISTLANDS, MushroomJotunPuffs: MISTLANDS,
  MushroomSmokePuff: MISTLANDS, DvergrKeyFragment: MISTLANDS,
  CuredSquirrelHamstring: MISTLANDS, SpiceMistlands: MISTLANDS,

  // ── Ashlands ──
  FlametalNew: ASHLANDS, Blackwood: ASHLANDS, Grausten: ASHLANDS,
  SulfurStone: ASHLANDS, ProustitePowder: ASHLANDS, MoltenCore: ASHLANDS,
  BlackCore: ASHLANDS, CharredBone: ASHLANDS, Charredskull: ASHLANDS,
  BellFragment: ASHLANDS, CelestialFeather: ASHLANDS,
  GemstoneRed: ASHLANDS, GemstoneGreen: ASHLANDS, GemstoneBlue: ASHLANDS,
  AskHide: ASHLANDS, AskBladder: ASHLANDS, AsksvinMeat: ASHLANDS,
  MorgenHeart: ASHLANDS, MorgenSinew: ASHLANDS,
  VoltureEgg: ASHLANDS, VoltureMeat: ASHLANDS,
  BoneMawSerpentMeat: ASHLANDS, BonemawSerpentTooth: ASHLANDS,
  MushroomBzerker: ASHLANDS, PungentPebbles: ASHLANDS,
  AxeHead1: ASHLANDS, AxeHead2: ASHLANDS, ScytheHandle: ASHLANDS,
  DyrnwynHiltFragment: ASHLANDS, DyrnwynBladeFragment: ASHLANDS,
  DyrnwynTipFragment: ASHLANDS, Fish11: ASHLANDS, SpiceAshlands: ASHLANDS,

  // ── Deep North ──
  Fish10: DEEPNORTH,
};

/**
 * Items whose recipe doesn't tell the truth about where you get them —
 * boss drops, vendor stock, and event/reward gear.
 */
const OVERRIDE: Record<string, number> = {
  // Boss drops / progression keys
  CryptKey: BLACKFOREST,       // The Elder
  Wishbone: SWAMP,             // Bonemass
  // Haldor stocks these once you find him in the Black Forest
  BeltStrength: BLACKFOREST,
  FishingRod: BLACKFOREST,
  HelmetYule: BLACKFOREST,
  // Dvergr gear you loot rather than craft
  HelmetDverger: MISTLANDS,
  DvergerArbalest: MISTLANDS,
  Demister: MISTLANDS,
  // Cosmetic / event items — never a spoiler
  HelmetSweatBand: MEADOWS,
  HelmetMidsummerCrown: MEADOWS,
  HelmetPointyHat: MEADOWS,
  HelmetStrawHat: MEADOWS,
  HelmetFishingHat: MEADOWS,
  HelmetCelebration: MEADOWS,
  ArmorStand: MEADOWS,
  // Legendary Ashlands weapon assembled from fragments
  SwordIronFire: ASHLANDS,
  // Mead with no listed base recipe — trolls put it in the Black Forest
  MeadTrollPheromones: BLACKFOREST,

  // Tame creatures: items.json files these under the 'Tame' subcategory rather
  // than a biome, so they'd never gate. Use where the wild animal lives.
  Bestiary_Boar_piggy: MEADOWS,
  Bestiary_Wolf_cub: MOUNTAIN,
  Bestiary_Lox_Calf: PLAINS,
  Bestiary_Hen: MISTLANDS,
  Bestiary_Chicken: MISTLANDS,
  Bestiary_Asksvin_hatchling: ASHLANDS,
};

function biomeFromAnchors(it: VhItem): number | null {
  const trophy = (it.trophyDrop as { biome?: string } | undefined)?.biome;
  const trinket = (it.trinket as { biome?: string } | undefined)?.biome;
  // `subcategory` is the biome on bestiary entries.
  const bestiary = it.page === 'bestiary' ? it.subcategory : undefined;
  let best: number | null = null;
  for (const name of [trophy, trinket, bestiary]) {
    if (name && name in BIOME_NAME) {
      const v = BIOME_NAME[name];
      if (best === null || v > best) best = v;
    }
  }
  return best;
}

/**
 * Resolve a biome for every item. Seeded from RAW_BIOME plus the anchors baked
 * into items.json, then relaxed through recipes until it settles: an item is as
 * deep as the deepest ingredient, station, or dish it comes from.
 */
export function buildItemBiomes(items: VhItem[]): Record<string, number> {
  const byCode: Record<string, VhItem> = {};
  for (const it of items) byCode[it.code] = it;

  const biome: Record<string, number> = {};
  const set = (code: string, v: number) => {
    if (v < 0 || v >= BIOME_COUNT) return false;
    if (biome[code] != null && biome[code] >= v) return false;
    biome[code] = v;
    return true;
  };

  for (const it of items) {
    const raw = RAW_BIOME[it.code];
    if (raw != null) set(it.code, raw);
    const anchor = biomeFromAnchors(it);
    if (anchor != null) set(it.code, anchor);
  }

  // Relax through recipes. Bounded by BIOME_COUNT + 2 passes: each pass can only
  // deepen an item, and depth is capped, so this settles quickly.
  for (let pass = 0; pass < BIOME_COUNT + 2; pass++) {
    let changed = false;
    for (const it of items) {
      if (OVERRIDE[it.code] != null) continue;   // applied last, wins outright
      const recipe = it.recipe;
      const parts: number[] = [];
      let complete = true;

      const station = recipe?.station;
      if (station && STATION_BIOME[station] != null) parts.push(STATION_BIOME[station]);

      for (const res of recipe?.resources ?? []) {
        const v = biome[res.item];
        // An ingredient we can't place yet — wait for a later pass rather than
        // guessing shallow, which would leak a late-game item into an early list.
        if (v == null) { complete = false; break; }
        parts.push(v);
      }

      const cooked = it.cookSource as string | undefined;
      if (complete && cooked && cooked !== 'None') {
        const v = biome[cooked];
        if (v == null && byCode[cooked]) complete = false;
        else if (v != null) parts.push(v);
      }

      // Meads: the finished drink inherits its base's tier.
      const finished = it.meadFinished as string | undefined;
      if (finished && biome[it.code] != null) {
        if (set(finished, biome[it.code])) changed = true;
      }

      if (!complete || parts.length === 0) continue;
      if (set(it.code, Math.max(...parts))) changed = true;
    }
    if (!changed) break;
  }

  for (const code in OVERRIDE) biome[code] = OVERRIDE[code];
  return biome;
}

// ── Runtime lookup (the raw renderers reach for this synchronously) ──
let MAP: Record<string, number> = {};
let builtFrom: VhItem[] | null = null;

/** Idempotent: callers may prime this from render and from an effect. */
export function setItemBiomes(items: VhItem[]): void {
  if (builtFrom === items) return;
  builtFrom = items;
  MAP = buildItemBiomes(items);
}

/** Biome index for an item, or null when we couldn't place it (never gated). */
export function itemBiomeIndex(code: string): number | null {
  const v = MAP[code];
  return v == null ? null : v;
}

/**
 * Classes for a list item: `sp-item sp-b<index>`. CSS in GuidesLayout.css blurs
 * these until `.vh-guides[data-spoiler]` passes the index, so dragging the
 * slider re-skins the list without a re-render.
 */
export function itemSpoilerClass(code: string): string {
  const idx = itemBiomeIndex(code);
  return idx == null ? '' : ` sp-item sp-b${idx}`;
}

/** True when this item is still hidden at the given revealed-biome count. */
export function isItemLocked(code: string, revealed: number): boolean {
  const idx = itemBiomeIndex(code);
  return idx != null && revealed <= idx;
}
