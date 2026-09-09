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
//   3. Anything left over fails CLOSED — see the end of buildItemBiomes. An
//      item we can't place is treated as maximally spoilery rather than shown
//      to everyone. Missing one `Upgrader*` idol here once un-gated 483 of 933
//      items, so this is deliberately the safe direction to be wrong in.
//
// So: to fix a wrong biome, first check whether a RAW_BIOME entry is off — that
// usually corrects a whole branch of recipes at once. Use OVERRIDE only for
// items whose recipe genuinely doesn't reflect where you get them. If something
// is hidden that shouldn't be, it's probably falling through to (3).

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
  piece_FrostKiln: DEEPNORTH,
  piece_FrostFoundry: DEEPNORTH,
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
  // Ore and the metal it becomes.
  GoldOre: DEEPNORTH, Gold: DEEPNORTH,
  // Gathered / mined / chopped.
  Frostwood: DEEPNORTH, FirConeFrost: DEEPNORTH, Ice: DEEPNORTH,
  Snowball: DEEPNORTH, FrostCore: DEEPNORTH, FrozenFuel: DEEPNORTH,
  GlowWorm: DEEPNORTH, SpiceDeepNorth: DEEPNORTH,
  // Farmed and foraged.
  Kale: DEEPNORTH, KaleSeeds: DEEPNORTH, Oat: DEEPNORTH, OatSeeds: DEEPNORTH,
  Poteitr: DEEPNORTH, PoteitrSeeds: DEEPNORTH, Lingonberry: DEEPNORTH,
  // Creature drops.
  MooseHide: DEEPNORTH, MooseMeat: DEEPNORTH, MooseSinew: DEEPNORTH,
  SealHide: DEEPNORTH, SealBlubber: DEEPNORTH, BarkaBranch: DEEPNORTH,
  ElakingHairBundle: DEEPNORTH, MoleClaws: DEEPNORTH, OozeMork: DEEPNORTH,
  HatefulBlood: DEEPNORTH, WrithanRoots: DEEPNORTH, Voidplasm: DEEPNORTH,
  // Krigen, Hexen and the Fallen Warrior.
  Leatherstraps: DEEPNORTH, MemorialCoal: DEEPNORTH, NornThread: DEEPNORTH,
  BloodGoldKey: DEEPNORTH, OrbFrostFire: DEEPNORTH, OrbThunderBlood: DEEPNORTH,
  // Looted from the imprisoned dvergr and the captive fulings.
  AncientCoin: DEEPNORTH, AncientGemstoneBlack: DEEPNORTH,
  AncientGemstoneGreen: DEEPNORTH, AncientGemstoneOrange: DEEPNORTH,
  AncientGemstonePurple: DEEPNORTH, CrownJewel: DEEPNORTH,
  // Kall Fimbulbringer.
  FrozenKingDrop: DEEPNORTH,
  // FaderEmber ("Embers") only ever feeds Deep North recipes and only appears
  // in localization_deepnorth, but the name points at the Ashlands boss. Filed
  // deep until someone confirms where it actually drops — over-gating a
  // material is a smaller sin than leaking one.
  FaderEmber: DEEPNORTH,
  Hook: DEEPNORTH, Lantern_DN: DEEPNORTH,
  // Windmill and foundry output: no Recipe on these, so nothing derives them.
  OatFlour: DEEPNORTH, FeastDeepNorth: DEEPNORTH, FeastDeepNorth_Material: DEEPNORTH,
  ArmorDeepNorthHeavyChest: DEEPNORTH, ArmorDeepNorthHeavylegs: DEEPNORTH,
  ArmorDeepNorthMageChest: DEEPNORTH, ArmorDeepNorthMagelegs: DEEPNORTH,
  ArmorDeepNorthMediumChest: DEEPNORTH, ArmorDeepNorthMediumlegs: DEEPNORTH,
  HelmetDNHeavy: DEEPNORTH, HelmetDNMage: DEEPNORTH, HelmetDNMediumHood: DEEPNORTH,

  // ── Ores, scraps and seeds ──
  // These predate 1.0 and were never listed, so they had always fallen through
  // as "unplaceable" and shown to everyone. Only visible now because the
  // fallback below stopped failing open.
  CopperOre: BLACKFOREST, CopperScrap: BLACKFOREST, TinOre: BLACKFOREST,
  BronzeScrap: BLACKFOREST, PineCone: BLACKFOREST, CarrotSeeds: BLACKFOREST,
  Coins: BLACKFOREST, QueenBee: MEADOWS, Acorn: MEADOWS, Amber: MEADOWS,
  StoneRock: MEADOWS, BeechSeeds: MEADOWS, BirchSeeds: MEADOWS,
  IronOre: SWAMP, IronScrap: SWAMP, Ectoplasm: SWAMP, TurnipSeeds: SWAMP,
  VegvisirShard_Bonemass: SWAMP,
  SilverOre: MOUNTAIN, SilverNecklace: MOUNTAIN, DragonEgg: MOUNTAIN,
  OnionSeeds: MOUNTAIN, Flametal: MOUNTAIN, FlametalOre: MOUNTAIN,
  BlackMetalScrap: PLAINS, GoblinTotem: PLAINS, YagluthDrop: PLAINS,
  QueenDrop: MISTLANDS, VineberrySeeds: MISTLANDS,
  VineGreenSeeds: MISTLANDS, Larva: MISTLANDS,
  FlametalOreNew: ASHLANDS, CharredCogwheel: ASHLANDS, FaderDrop: ASHLANDS,
  BonemawSerpentScale: ASHLANDS, AsksvinEgg: ASHLANDS, Softtissue: ASHLANDS,
  AsksvinCarrionNeck: ASHLANDS, AsksvinCarrionPelvic: ASHLANDS,
  AsksvinCarrionRibcage: ASHLANDS, AsksvinCarrionSkull: ASHLANDS,
  // Hildir's three chests and their keys sit in the biome of the dungeon.
  HildirKey_forestcrypt: BLACKFOREST, chest_hildir1: BLACKFOREST,
  HildirKey_mountaincave: MOUNTAIN, chest_hildir2: MOUNTAIN,
  HildirKey_plainsfortress: PLAINS, chest_hildir3: PLAINS,
  // Trophy prefabs the extractor doesn't manage to link to a creature, so they
  // arrive with no biome anchor. TrophyDraugrFem duplicates TrophyDraugr;
  // TrophyForestTroll is the troll's only trophy but its drop never resolves.
  TrophyDraugrFem: SWAMP, TrophyForestTroll: BLACKFOREST,
  // Cosmetic / vendor odds and ends.
  Sparkler: MEADOWS, Tankard_dvergr: MISTLANDS,
};

/**
 * Still unplaced after everything above, and so hidden until the reader has
 * revealed every biome (see the fallback at the end of buildItemBiomes):
 * CandleWick, CharcoalResin, FishAnglerRaw, Pot_Shard_Green,
 * Lantern_hooded, HelmetRootCrown. All are 1.0 additions whose
 * source nobody has confirmed yet. Move each into RAW_BIOME as it's pinned
 * down — being over-gated is the safe place for them to sit meanwhile.
 */

/**
 * 1.0 put an upgrade "idol" in nearly every recipe — `Upgrader3Armor` and so
 * on, eight tiers of each. They matter here out of all proportion to their
 * gameplay weight: an ingredient with no biome makes the whole recipe
 * unplaceable, and an unplaceable item is never gated, so leaving these out
 * silently un-gated 483 of 933 items across every biome, not just this one.
 *
 * The tier is the progression step, which skips Ocean.
 */
const UPGRADER_TIER = [MEADOWS, BLACKFOREST, SWAMP, MOUNTAIN, PLAINS,
  MISTLANDS, ASHLANDS, DEEPNORTH];
for (let tier = 0; tier < UPGRADER_TIER.length; tier++) {
  RAW_BIOME[`Upgrader${tier}Armor`] = UPGRADER_TIER[tier];
  RAW_BIOME[`Upgrader${tier}Weapon`] = UPGRADER_TIER[tier];
}

/**
 * Every `Mold*` is Deep North loot — you find the mould, then cast the Nord
 * weapon or armour from it at the Frost Foundry. They have no recipe of their
 * own, so without this the entire Nord tier (every Cast:, every finished piece)
 * stayed unplaceable and therefore ungated. Matched by prefix because the set
 * grows with each new mould.
 */
export function isMoldCode(code: string): boolean {
  return /^Mold[A-Z]/.test(code);
}

/**
 * Items whose recipe doesn't tell the truth about where you get them —
 * boss drops, vendor stock, and event/reward gear.
 */
const OVERRIDE: Record<string, number> = {
  // Boss drops / progression keys
  CryptKey: BLACKFOREST,       // The Elder
  Wishbone: SWAMP,             // Bonemass
  // Haldor stocks these once you find him in the Black Forest
  // (the full list is `vendorPrice` in ValHelpTools/Scripts/item_overrides.json).
  BeltStrength: BLACKFOREST,
  FishingRod: BLACKFOREST,
  HelmetYule: BLACKFOREST,
  BarrelRings: BLACKFOREST,
  Thunderstone: BLACKFOREST,
  DvergrNeedle: BLACKFOREST,
  DvergrLantern: BLACKFOREST,
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
    if (isMoldCode(it.code)) set(it.code, DEEPNORTH);
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
        // `amount: 0` means the material is only spent on *upgrades* — the base
        // craft doesn't need it. Leather armour asks for 0 bone fragments, so
        // counting them would push the Meadows starter set into Black Forest.
        if (res.amount === 0) continue;
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

  // Anything still unplaced used to be left out of the map entirely, and
  // `itemBiomeIndex` returns null for those — which the callers read as "never
  // gated". That is the wrong way for a spoiler system to fail: a gap in the
  // data above should hide too much, never too little. So close it out here.
  //
  // Two steps, in order of how much we actually know:
  //   1. If the recipe has ingredients we *did* place, the item is at least as
  //      deep as the deepest of them.
  //   2. Otherwise we know nothing about it — treat it as fully spoilery, so it
  //      only appears once the reader has revealed everything.
  const DEEPEST = BIOME_COUNT - 1;
  for (const it of items) {
    if (biome[it.code] != null) continue;
    const known: number[] = [];
    for (const res of it.recipe?.resources ?? []) {
      if (res.amount === 0) continue;
      const v = biome[res.item];
      if (v != null) known.push(v);
    }
    biome[it.code] = known.length ? Math.max(...known) : DEEPEST;
  }

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
