// ── Biome cheat sheets ────────────────────────────────────────────
// One compact card per biome: what to eat, wear, drink, swing, and build by
// the time you leave. Rendered by renderBiomeSheet() in vhRender.raw.ts via
// the `{sheet:<biome>}` markdown macro, and by BiomeSheetCycler on the guides
// landing page — both read this file, so a pick only ever changes here.
//
// Item codes are looked up in items.json at render time, so armor totals,
// food stats and icons stay in sync with the game data. Only the *choices*
// (and the prose notes) live here.

import { biomeIndex } from './spoiler';

// Spoiler indexes (see SPOILER_BIOMES). Ocean is index 2 and gates nothing —
// no station, upgrade or set is locked behind it — so it never appears below.
const MEADOWS = 0, BLACKFOREST = 1, SWAMP = 3, MOUNTAIN = 4,
  PLAINS = 5, MISTLANDS = 6, ASHLANDS = 7, DEEPNORTH = 8;

// ── Workstations ──────────────────────────────────────────────────
// A station's level is 1 (the base piece) plus one per upgrade you can
// build. Each upgrade lists the biome that gates its rarest material, so
// levelAt() below derives every biome's max level from this one table —
// see the material notes for why each one lands where it does.

/** `mats` is the real build cost, [item code, count] — the station pages
 *  render it as recipe cards, and the tooltips on the cheat sheet read it. */
export type StationUpgrade = { code: string; name: string; biome: number; mats: [string, number][] };

export type StationDef = {
  code: string;
  name: string;
  biome: number;                 // where the base piece becomes buildable
  upgrades: StationUpgrade[];
};

export const STATIONS: Record<string, StationDef> = {
  piece_workbench: {
    code: 'piece_workbench', name: 'Workbench', biome: MEADOWS,
    upgrades: [
      { code: 'piece_workbench_ext1', name: 'Chopping block', biome: MEADOWS, mats: [['Wood', 10], ['Flint', 10]] },
      { code: 'piece_workbench_ext2', name: 'Tanning rack', biome: MEADOWS, mats: [['Wood', 10], ['Flint', 15], ['LeatherScraps', 20], ['DeerHide', 5]] },
      { code: 'piece_workbench_ext3', name: 'Adze', biome: BLACKFOREST, mats: [['FineWood', 10], ['Bronze', 3]] },
      { code: 'piece_workbench_ext4', name: 'Tool shelf', biome: MOUNTAIN, mats: [['Iron', 4], ['FineWood', 10], ['Obsidian', 4]] },
    ],
  },
  forge: {
    code: 'forge', name: 'Forge', biome: BLACKFOREST,
    upgrades: [
      { code: 'forge_ext2', name: 'Anvils', biome: BLACKFOREST, mats: [['Wood', 5], ['Bronze', 2]] },
      { code: 'forge_ext5', name: 'Forge cooler', biome: BLACKFOREST, mats: [['FineWood', 25], ['Copper', 10]] },
      { code: 'forge_ext1', name: 'Forge bellows', biome: SWAMP, mats: [['Wood', 5], ['DeerHide', 5], ['Chain', 4]] },
      { code: 'forge_ext4', name: "Smith's anvil", biome: SWAMP, mats: [['Iron', 20], ['Wood', 5]] },
      { code: 'forge_ext6', name: 'Forge toolrack', biome: SWAMP, mats: [['Iron', 15], ['Wood', 10]] },
      // Sharpening stones are cut at a stonecutter, which needs iron.
      { code: 'forge_ext3', name: 'Grinding wheel', biome: SWAMP, mats: [['Wood', 25], ['SharpeningStone', 1]] },
    ],
  },
  piece_cauldron: {
    code: 'piece_cauldron', name: 'Cauldron', biome: BLACKFOREST,
    upgrades: [
      { code: 'cauldron_ext1_spice',           name: 'Spice rack',        biome: SWAMP,     mats: [['Dandelion', 3], ['Carrot', 2], ['Mushroom', 5], ['Thistle', 3], ['Turnip', 3]] },
      { code: 'cauldron_ext3_butchertable',    name: "Butcher's table",   biome: MOUNTAIN,  mats: [['ElderBark', 2], ['RoundLog', 4], ['FineWood', 4], ['Silver', 2]] },
      { code: 'cauldron_ext4_pots',            name: 'Pots and pans',     biome: PLAINS,    mats: [['Iron', 5], ['Copper', 5], ['BlackMetal', 5], ['FineWood', 10]] },
      { code: 'cauldron_ext5_mortarandpestle', name: 'Mortar and pestle', biome: MISTLANDS, mats: [['BlackMarble', 8], ['FineWood', 6], ['RoundLog', 4]] },
      { code: 'cauldron_ext6_rollingpins',     name: 'Rolling pins',      biome: ASHLANDS,  mats: [['Blackwood', 8], ['FineWood', 6], ['FlametalNew', 4]] },
      { code: 'cauldron_ext7_smoker',          name: 'Smoker',            biome: DEEPNORTH, mats: [['Gold', 5], ['Frostwood', 6]] },
    ],
  },
  blackforge: {
    code: 'blackforge', name: 'Black Forge', biome: MISTLANDS,
    upgrades: [
      { code: 'blackforge_ext1',             name: 'Black forge cooler', biome: MISTLANDS, mats: [['Iron', 5], ['Copper', 5], ['BlackMarble', 4]] },
      { code: 'blackforge_ext2_vise',        name: 'Vice',               biome: MISTLANDS, mats: [['Iron', 5], ['Copper', 8], ['MechanicalSpring', 2]] },
      { code: 'blackforge_ext3_metalcutter', name: 'Metal cutter', biome: ASHLANDS, mats: [['BlackMarble', 5], ['FlametalNew', 5], ['Blackwood', 5], ['CharredBone', 4]] },
      { code: 'blackforge_ext4_gemcutter',   name: 'Gem cutter',         biome: ASHLANDS,  mats: [['FlametalNew', 5], ['Blackwood', 8], ['MorgenSinew', 2], ['GemstoneRed', 1]] },
      { code: 'blackforge_ext5_apron',       name: "Smith's Aprons",     biome: DEEPNORTH, mats: [['Gold', 5], ['Frostwood', 8], ['MooseHide', 2]] },
    ],
  },
  piece_artisanstation: {
    code: 'piece_artisanstation', name: 'Artisan Table', biome: PLAINS,
    upgrades: [
      // Its one upgrade, and the only route to level 2 — Ceramic Plate and
      // Shield Core both need it. Costs a Majestic Carapace, so it is gated
      // behind the Queen even though the table itself is a Plains build.
      // The prefab is `artisan_ext1`, not the `piece_artisanstation_ext1` the
      // station's own name suggests — that mismatch is why this card used to
      // render without an icon.
      { code: 'artisan_ext1', name: 'Artisan Press', biome: MISTLANDS, mats: [['BlackMarble', 5], ['Bronze', 5], ['QueenDrop', 1]] },
    ],
  },
  piece_magetable: {
    code: 'piece_magetable', name: 'Galdr Table', biome: MISTLANDS,
    upgrades: [
      { code: 'piece_magetable_ext',  name: 'Rune table',       biome: MISTLANDS, mats: [['BlackMarble', 10], ['YggdrasilWood', 5], ['Eitr', 10]] },
      { code: 'piece_magetable_ext2', name: 'Unfading candles', biome: MISTLANDS, mats: [['BlackMarble', 10], ['TrophySkeleton', 3], ['Eitr', 10], ['Resin', 15]] },
      { code: 'piece_magetable_ext3', name: 'Feathery wreath', biome: ASHLANDS, mats: [['CelestialFeather', 8], ['TrophyAsksvin', 1], ['Eitr', 10], ['Blackwood', 3]] },
      { code: 'piece_magetable_ext4', name: 'Standing Loom',   biome: DEEPNORTH, mats: [['Frostwood', 5], ['NornThread', 10]] },
    ],
  },
};

/** Max level of a station once you have cleared everything up to `biome`. 0 = not buildable yet. */
export function stationLevelAt(stationCode: string, biome: number): number {
  const st = STATIONS[stationCode];
  if (!st || biome < st.biome) return 0;
  return 1 + st.upgrades.filter(u => u.biome <= biome).length;
}

/** Which stations a sheet shows. Workbench and forge are maxed and off the
 *  critical path by the Mistlands, so they hand their two slots to the Black
 *  Forge and Galdr Table. The cauldron keeps upgrading the whole game. */
export function stationsFor(biome: number): string[] {
  return biome >= MISTLANDS
    ? ['blackforge', 'piece_magetable', 'piece_cauldron']
    : ['piece_workbench', 'forge', 'piece_cauldron'];
}

// ── Station pages ─────────────────────────────────────────────────
// Every station that something is actually crafted at gets its own guide page
// (/guides/stations/<code>), so each page is guaranteed a craftable list. The
// five in STATIONS above also show their upgrade pieces; the rest are flat.
// `blurb` is the one-line "what is this for" under the title.

export type StationPage = { code: string; biome: number; blurb: string };

export const STATION_PAGES: StationPage[] = [
  { code: 'piece_workbench', biome: MEADOWS, blurb: 'The first thing you build and the one you never stop using. Needs a roof and walls before it will craft anything complex.' },
  { code: 'piece_cauldron', biome: BLACKFOREST, blurb: 'Turns raw ingredients into real food. Every point of Health and Stamina you gain past the first hour starts here.' },
  { code: 'forge', biome: BLACKFOREST, blurb: 'Metal work: every bronze, iron, silver and black metal weapon and armour piece.' },
  { code: 'piece_MeadCauldron', biome: BLACKFOREST, blurb: 'Brews mead bases, which then ferment into the potions that answer each biome hazard.' },
  { code: 'piece_stonecutter', biome: SWAMP, blurb: 'Unlocks stone building — and the sharpening stone the forge needs for its last upgrade.' },
  { code: 'piece_preptable', biome: SWAMP, blurb: 'Assembles feasts: one big shared dish instead of three personal foods.' },
  { code: 'piece_artisanstation', biome: PLAINS, blurb: 'A short but essential list — the windmill, spinning wheel and blast furnace all come from here.' },
  { code: 'blackforge', biome: MISTLANDS, blurb: 'The forge, replaced. Everything from the Mistlands on is made here.' },
  { code: 'piece_magetable', biome: MISTLANDS, blurb: 'Magic: staves, eitr-weave robes, and the refined eitr they all need.' },
];

export function stationPage(code: string): StationPage | undefined {
  return STATION_PAGES.find(s => s.code === code);
}

// ── Comfort ───────────────────────────────────────────────────────
// Comfort upgrades exactly like a workstation, so the card draws it as one.
// Shelter is the base level; each furniture category is a slot you upgrade as
// better pieces unlock (campfire → hearth, wood chair → throne). Only the best
// piece in a category counts, so a room with three banners is a room with one.
//
// The categories are the game's own `Piece.ComfortGroup`, which 1.0 grew from
// seven to eleven — Item stand, Ornament, Garland, Lantern and Bathing used to
// be lumped together as "Standalone", which is why the old totals ran low.
// Group 0 (no group at all) is the only one that really does stack per piece,
// and after 1.0 the only two pieces left in it are the Maypole and the Yule
// Tree — both event-only, so neither is part of a total you can build today.
//
// Every code and value below comes from items.json (`comfortGroup`,
// `comfort`); the biome is where the piece's rarest material or its crafting
// station unlocks, matching itemBiome.ts. The totals this produces are the
// per-biome table in docs/comfort.md; keep the two in step.

export const COMFORT_BASE = 2;      // being sheltered, before any furniture

export type ComfortPick = { code: string; comfort: number; biome: number };
export type ComfortSlot = { group: string; picks: ComfortPick[] };

export const COMFORT_SLOTS: ComfortSlot[] = [
  // The hearth is only 15 stone, but it needs the stonecutter — so it is Swamp.
  { group: 'Fire',    picks: [{ code: 'fire_pit', comfort: 1, biome: MEADOWS }, { code: 'hearth', comfort: 2, biome: SWAMP }] },
  { group: 'Bed',     picks: [{ code: 'bed', comfort: 1, biome: MEADOWS }, { code: 'piece_bed02', comfort: 2, biome: MOUNTAIN }] },
  // 1.0 put bears in the Black Forest, and their rug is a +2 — the first
  // category that goes past +1 without leaving the second biome.
  { group: 'Carpet',  picks: [{ code: 'rug_deer', comfort: 1, biome: MEADOWS }, { code: 'rug_Bjorn', comfort: 2, biome: BLACKFOREST }] },
  // A sitting log found at a Meadows camp counts too, but nothing in the
  // Meadows is craftable — the first seat you can build is the wood chair.
  { group: 'Seating', picks: [{ code: 'piece_chair02', comfort: 2, biome: BLACKFOREST }, { code: 'piece_throne01', comfort: 3, biome: SWAMP }] },
  { group: 'Table',   picks: [{ code: 'piece_table', comfort: 1, biome: BLACKFOREST }, { code: 'piece_table_round', comfort: 2, biome: PLAINS }] },
  // Jute curtains are banners as far as the game is concerned, and they are
  // the only +2 in the category.
  { group: 'Banner',  picks: [{ code: 'piece_banner01', comfort: 1, biome: BLACKFOREST }, { code: 'piece_cloth_hanging_door', comfort: 2, biome: PLAINS }] },
  // The item stand is bronze nails, so the category opens a whole biome
  // earlier than the armour stand most guides name.
  { group: 'Item stand', picks: [{ code: 'itemstand', comfort: 1, biome: BLACKFOREST }] },
  { group: 'Garland',    picks: [{ code: 'piece_CelebrationGarland', comfort: 1, biome: BLACKFOREST }] },
  // The barber station is a Bathing piece; the hot tub replaces it at +2.
  { group: 'Bathing',    picks: [{ code: 'piece_barber', comfort: 1, biome: BLACKFOREST }, { code: 'piece_bathtub', comfort: 2, biome: PLAINS }] },
  // Mistlands is no longer a dead biome for comfort — the dvergr lantern is
  // the category's first piece, and the lava lantern doubles it.
  { group: 'Lantern',    picks: [{ code: 'piece_dvergr_lantern', comfort: 1, biome: MISTLANDS }, { code: 'piece_Lavalantern', comfort: 2, biome: ASHLANDS }] },
  // Green pots are the other Ornament, but nobody has pinned down where the
  // shards drop, so the asksvin skeleton is the one we can date.
  { group: 'Ornament',   picks: [{ code: 'piece_asksvinskeleton', comfort: 1, biome: ASHLANDS }] },
];

// Excluded from every total above: the Maypole (Midsummer) and Yule Tree
// (Yule) are +1 each and stack, but they are buildable for a few weeks a year,
// so a "max comfort" that counts them is not a number you can go and reach.
// The other event pieces — Jack-o-turnip, and the three Yule garlands — fill a
// category that is already full by the time you can build them.

/** Best piece in a slot once you have cleared `biome`, or null if still empty. */
export function comfortPick(slot: ComfortSlot, biome: number): ComfortPick | null {
  let best: ComfortPick | null = null;
  for (const p of slot.picks) {
    if (p.biome <= biome && (!best || p.comfort > best.comfort)) best = p;
  }
  return best;
}

/** Max comfort reachable by the end of `biome` (seasonal pieces excluded). */
export function comfortAt(biome: number): number {
  return COMFORT_SLOTS.reduce(
    (n, slot) => n + (comfortPick(slot, biome)?.comfort ?? 0),
    COMFORT_BASE,
  );
}

export const COMFORT_CAP = comfortAt(DEEPNORTH);

/** Rested lasts 7 minutes plus one per point of comfort: comfort 1 is 8
 *  minutes, and shelter alone (+2) makes it 10. */
export function restedMinutes(comfort: number): number {
  return 7 + comfort;
}

// ── Sheets ────────────────────────────────────────────────────────

export type SheetArmor = {
  label: string;
  pieces: string[];       // helmet, chest, legs — armor total is summed from items.json
  cape?: string;
  quality: number;        // realistic quality by the end of the biome
  /** Equipped-armor screenshot. `--todo` in ingest_guide_shots.py lists the
   *  missing ones; until then the card shows the placeholder silhouette. */
  img?: string;
  shot?: string;          // capture brief for that screenshot
  note?: string;
};

// ── Builds ────────────────────────────────────────────────────────
// Every biome offers the same question in different armour: soak the hit or
// never be there for it. Gear, food and weapon all move together — a heavy
// build wants Health to survive a trade, a light one wants the Stamina to
// dodge, bow and keep moving. From the Mistlands a third answer opens up:
// Eitr, robes and a staff.

export type BuildKey = 'light' | 'heavy' | 'magic';

export const BUILD_ORDER: BuildKey[] = ['light', 'heavy', 'magic'];
export const BUILD_LABELS: Record<BuildKey, string> = {
  light: 'Light',
  heavy: 'Heavy',
  magic: 'Magic',
};

export type SheetBuild = {
  /** Three-food loadout, best on the left. Totals are summed from items.json. */
  foods: string[];
  foodNote?: string;
  armor: SheetArmor;
  weapon: { code: string; quality: number; note?: string };
  /** What fills the other hand. Only set where the weapon leaves it free —
   *  an atgeir, a bow or a pair of fists take both, and the notes say so
   *  instead. gear.md's thesis is that a parry beats an armour tier, so
   *  where a buckler fits it is as much of a pick as the weapon. */
  offhand?: { code: string; quality: number };
};

export type BiomeSheet = {
  key: string;
  label: string;
  /** The header draws this as a chain: what you offer at the altar → the boss
   *  → what you walk away with. Ocean has no boss, so it has no chain. */
  boss?: {
    trophy: string;
    name: string;
    /** When the offering is itself crafted, the raw drop that feeds it —
     *  9 sealbreaker fragments make the one Sealbreaker you hand over. */
    prestep?: [string, number];
    offering: [string, number];
    drops: [string, number][];
  };
  /** Meads are shared: they answer the biome's hazard, not your build. */
  meads: string[];
  meadNote?: string;
  /** One trinket slot, and gear.md picks per biome rather than per build —
   *  so it sits here with the meads. */
  trinket?: { code: string; note?: string };
  /** Light is the one build every biome has; Meadows offers nothing else, and
   *  heavy/magic open up as their armour and Eitr do. */
  builds: { light: SheetBuild; heavy?: SheetBuild; magic?: SheetBuild };
  // Comfort isn't listed per biome — comfortAt() derives it from COMFORT_SLOTS.
};

/** Which build tabs a sheet offers, in display order. */
export function buildKeysFor(sheet: BiomeSheet): BuildKey[] {
  return BUILD_ORDER.filter(k => !!sheet.builds[k]);
}

export const BIOME_SHEETS: Record<string, BiomeSheet> = {
  meadows: {
    key: 'meadows', label: 'Meadows',
    boss: { trophy: 'TrophyEikthyr', name: 'Eikthyr', offering: ['TrophyDeer', 2], drops: [['HardAntler', 3]] },
    meads: [],
    meadNote: '(check next biome)',
    builds: {
      // Meadows has exactly one set, so here the choice is only how you fight.
      light: {
        foods: ['CookedMeat', 'NeckTailGrilled', 'Raspberry'],
        foodNote: 'Cook deer meat freely — keep boar meat and neck tails raw for later recipes.',
        armor: {
          label: 'Leather', pieces: ['HelmetLeather', 'ArmorLeatherChest', 'ArmorLeatherLegs'],
          quality: 2,
          img: '/img/guide/meadows/armor-leather.webp',
          shot: 'Character in full Leather set (no cape), third person, Meadows daylight.',
          note: 'Save materials — spare deer hide goes on the helmet first. No shield exists yet, so dodge and parry with the weapon.',
        },
        weapon: { code: 'SpearFlint', quality: 3, note: 'Melee and a throw from one cheap weapon, and the fastest skill in the game to level. Club at quality 4 for necks and skeletons; a flint axe doubles as your finewood tool.' },
      },
    },
  },

  blackforest: {
    key: 'blackforest', label: 'Black Forest',
    boss: { trophy: 'TrophyTheElder', name: 'The Elder', offering: ['AncientSeed', 3], drops: [['CryptKey', 1]] },
    meads: ['MeadHealthMinor', 'MeadPoisonResist'],
    meadNote: 'Bank poison resist now — it is the swamp entry ticket.',
    // gear.md names the Bronze Pendant here, but its recipe wants 3 Mountain
    // rubies — this is the same 50-adrenaline threshold, craftable now.
    trinket: { code: 'TrinketBronzeHealth', note: 'Triggers at only 50 adrenaline, so it fires far more often than the pricier late-game trinkets.' },
    builds: {
      light: {
        foods: ['DeerStew', 'CarrotSoup', 'QueensJam'],
        foodNote: "Start a carrot farm early — carrots also tame boars. Queen's Jam is the cheap third slot until it is running.",
        armor: {
          label: 'Troll', pieces: ['HelmetTrollLeather', 'ArmorTrollLeatherChest', 'ArmorTrollLeatherLegs'],
          cape: 'CapeTrollHide', quality: 2,
          img: '/img/guide/black-forest/armor-troll.webp',
          shot: 'Character in full Troll Leather set with Troll Hide cape, third person, Black Forest.',
          note: 'Full set gives a sneak bonus — the quiet way through a burial chamber. The Bear set trades it for no move penalty and +30% health regen.',
        },
        weapon: { code: 'FistBjornClaw', quality: 2, note: 'Fists parry at 6×, the highest in the game, and the kick staggers. A Finewood Bow and fire arrows still open every fight.' },
      },
      heavy: {
        foods: ['DeerStew', 'MinceMeatSauce', 'CarrotSoup'],
        armor: {
          label: 'Bronze', pieces: ['HelmetBronze', 'ArmorBronzeChest', 'ArmorBronzeLegs'],
          cape: 'CapeTrollHide', quality: 2,
          img: '/img/guide/black-forest/armor-bronze.webp',
          shot: 'Character in full Bronze set with Troll Hide cape, third person, Black Forest.',
        },
        weapon: { code: 'AtgeirBronze', quality: 2, note: 'Spin is 6× stagger — it crowd-controls greydwarves and stagger-locks trolls. Both hands, though: drop to a Bronze Mace and Buckler when you want to parry.' },
      },
    },
  },

  ocean: {
    key: 'ocean', label: 'Ocean',
    meads: ['MeadSwimmer', 'MeadHealthMinor'],
    meadNote: 'Vananidir halves swim stamina — the difference between losing a boat and losing the cargo too.',
    trinket: { code: 'TrinketChitinSwim', note: 'Fires at 10 adrenaline, the lowest threshold in the game.' },
    builds: {
      light: {
        foods: ['SerpentStew', 'CarrotSoup', 'QueensJam'],
        foodNote: 'Stamina is what gets you back to the boat.',
        armor: {
          label: 'Troll', pieces: ['HelmetTrollLeather', 'ArmorTrollLeatherChest', 'ArmorTrollLeatherLegs'],
          cape: 'CapeTrollHide', quality: 2,
          note: 'Light gear swims and rows further — no sea-going set exists.',
        },
        weapon: { code: 'KnifeChitin', quality: 2, note: 'Abyssal Harpoon first, drag the serpent aground, then knife it. Iron-tier damage for chitin, and it parries at 4× — worth carrying back inland.' },
      },
      heavy: {
        foods: ['SerpentStew', 'SerpentMeatCooked', 'QueensJam'],
        foodNote: 'Serpents are the whole larder out here — the jam keeps you rowing.',
        armor: {
          label: 'Bronze', pieces: ['HelmetBronze', 'ArmorBronzeChest', 'ArmorBronzeLegs'],
          cape: 'CapeTrollHide', quality: 2,
          note: 'Metal sinks you fast — never fight in the water wearing it.',
        },
        weapon: { code: 'AtgeirBronze', quality: 2, note: 'Reach matters when the serpent is alongside the hull.' },
      },
    },
  },

  swamp: {
    key: 'swamp', label: 'Swamp',
    boss: { trophy: 'TrophyBonemass', name: 'Bonemass', offering: ['WitheredBone', 10], drops: [['Wishbone', 1]] },
    meads: ['MeadPoisonResist', 'MeadHealthMedium'],
    meadNote: 'Poison resist is not optional down here.',
    trinket: { code: 'TrinketIronStamina', note: 'Speed and instant stamina, which is exactly what the rain debuff takes off you.' },
    builds: {
      light: {
        foods: ['Sausages', 'TurnipStew', 'ShocklateSmoothie'],
        foodNote: 'Start a turnip farm the day you find the seeds. Serpent Stew instead of the shake if you have been to sea.',
        armor: {
          label: 'Root', pieces: ['HelmetRoot', 'ArmorRootChest', 'ArmorRootLegs'],
          cape: 'CapeTrollHide', quality: 2,
          img: '/img/guide/swamp/armor-root.webp',
          shot: 'Character in full Root armour set, third person, swamp backdrop.',
          note: 'Ranger set: +15 Bow skill, Pierce resistance on the chest, poison resistance on the helmet — the set for the Bonemass fight. Weak to Fire, so carry Barley Wine later.',
        },
        weapon: { code: 'BowHuntsman', quality: 2, note: 'The only bow with reduced noise — 4m instead of 15m, which is what lets you clear a crypt one draugr at a time.' },
      },
      heavy: {
        foods: ['Sausages', 'SerpentStew', 'TurnipStew'],
        foodNote: 'Two health and one stamina is the melee split. Save serpent meat for the boss if supply is short.',
        armor: {
          label: 'Iron + Root', pieces: ['HelmetIron', 'ArmorRootChest', 'ArmorIronLegs'],
          cape: 'CapeTrollHide', quality: 2,
          img: '/img/guide/swamp/armor-iron.webp',
          shot: 'Character in Iron helmet and greaves with the Root Harnesk chest, third person, swamp backdrop.',
          note: 'Root Harnesk is the best single armour piece in the game — its Pierce resistance still earns a slot in Mistlands hybrids. Trade three armor for it without thinking.',
        },
        weapon: { code: 'MaceIron', quality: 3, note: 'Blunt is king here, boss included — Iron Sledge for a packed crypt room.' },
        offhand: { code: 'ShieldIronBuckler', quality: 2 },
      },
    },
  },

  mountain: {
    key: 'mountain', label: 'Mountain',
    boss: { trophy: 'TrophyDragonQueen', name: 'Moder', offering: ['DragonEgg', 3], drops: [['DragonTear', 10]] },
    meads: ['MeadFrostResist', 'MeadHealthMedium', 'MeadStaminaMinor'],
    meadNote: 'Frost resist or a wolf cape — you need one of the two to be up here at all.',
    trinket: { code: 'TrinketSilverDamage', note: '+10% Pierce and +20 Bow/Spear skill — the biggest ranged jump any trinket gives.' },
    builds: {
      light: {
        foods: ['WolfMeatSkewer', 'Eyescream', 'OnionSoup'],
        foodNote: 'Onion Soup needs no cauldron upgrade — cook it before you go looking for silver, and plant a big onion farm.',
        armor: {
          label: 'Fenris', pieces: ['HelmetFenring', 'ArmorFenringChest', 'ArmorFenringLegs'],
          cape: 'CapeWolf', quality: 2,
          img: '/img/guide/mountain/armor-fenris.webp',
          shot: 'Character in full Fenris armour with Wolf Fur cape, snow backdrop.',
          note: 'The only armour that makes you faster (+9%), Frost and Fire resistant, and +15 Unarmed — the set and the fists are one pick.',
        },
        weapon: { code: 'FistFenrirClaw', quality: 2, note: 'Fenris feeds them +15 skill and they parry at 6×. A Wolf Fang Spear rides along for anything you would rather throw at.' },
      },
      heavy: {
        foods: ['WolfMeatSkewer', 'SerpentStew', 'Eyescream'],
        foodNote: 'Onion Soup or Salad instead of the stew if you never went to sea.',
        armor: {
          label: 'Wolf', pieces: ['HelmetDrake', 'ArmorWolfChest', 'ArmorWolfLegs'],
          cape: 'CapeWolf', quality: 2,
          img: '/img/guide/mountain/armor-wolf.webp',
          shot: 'Character in full Wolf armour with Drake helmet and Wolf Fur cape, snow backdrop.',
          note: 'The cape is the freeze protection — never climb without it.',
        },
        weapon: { code: 'MaceSilver', quality: 2, note: 'Frostner is Blunt, Frost and Spirit at once — it stays competitive all the way through Ashlands. Silver Sword for Moder herself.' },
        offhand: { code: 'ShieldSilver', quality: 2 },
      },
    },
  },

  plains: {
    key: 'plains', label: 'Plains',
    boss: { trophy: 'TrophyGoblinKing', name: 'Yagluth', offering: ['GoblinTotem', 5], drops: [['YagluthDrop', 5]] },
    meads: ['BarleyWine', 'MeadHealthMedium', 'MeadStaminaMedium'],
    meadNote: 'Barley Wine cancels the Fire weakness that Root armour and the Feather Cape carry.',
    trinket: { code: 'TrinketBlackStamina', note: '+50% parry bonus and −50% block stamina for a full 120s — long enough to chain into the next trigger.' },
    builds: {
      light: {
        foods: ['LoxPie', 'BloodPudding', 'Bread'],
        foodNote: 'Get flax and barley in the ground. Tame lox with cloudberries — their meat stays relevant through Mistlands.',
        armor: {
          label: 'Vilebone', pieces: ['HelmetBerserkerUndead', 'ArmorBerserkerUndeadChest', 'ArmorBerserkerUndeadLegs'],
          cape: 'CapeLox', quality: 2,
          shot: 'Character in full Vilebone armour with Lox cape, third person, plains at dusk.',
          note: 'No move penalty, +40% stamina regen, +20% Blunt and Pierce. It costs +25% physical vulnerability, which is free if you parry and expensive if you do not.',
        },
        weapon: { code: 'BowDraugrFang', quality: 3, note: "Needle arrows, and the set's +20% Pierce rides along. Kite the fulings; never let a berserker reach you. Vilebone Maulclaws for when one does." },
      },
      heavy: {
        foods: ['LoxPie', 'FishWraps', 'Bread'],
        armor: {
          label: 'Padded + Root', pieces: ['HelmetPadded', 'ArmorRootChest', 'ArmorPaddedGreaves'],
          cape: 'CapeLox', quality: 2,
          img: '/img/guide/plains/armor-padded.webp',
          shot: 'Character in Padded helmet and greaves with the Root Harnesk chest and Lox cape, third person, plains at dusk.',
          note: 'Deathquitos and fuling spears are Pierce — the Root Harnesk halves both, and outperforms the padded cuirass it replaces.',
        },
        weapon: { code: 'MaceNeedle', quality: 3, note: 'Porcupine is Blunt and Pierce together and carries the whole biome.' },
        offhand: { code: 'ShieldBlackmetal', quality: 2 },
      },
    },
  },

  mistlands: {
    key: 'mistlands', label: 'Mistlands',
    boss: { trophy: 'TrophySeekerQueen', name: 'The Queen', prestep: ['DvergrKeyFragment', 9], offering: ['DvergrKey', 1], drops: [['QueenDrop', 1]] },
    meads: ['MeadHealthMajor', 'MeadEitrMinor', 'MeadLightfoot'],
    meadNote: 'Lightfoot is a traversal tool here, not a luxury — the terrain is vertical.',
    trinket: { code: 'TrinketScaleStaminaDamage', note: '+100 instant stamina at 75 adrenaline, which is a whole extra engagement.' },
    builds: {
      light: {
        foods: ['MisthareSupreme', 'MushroomOmelette', 'Salad'],
        armor: {
          label: 'Fenris', pieces: ['HelmetFenring', 'ArmorFenringChest', 'ArmorFenringLegs'],
          cape: 'CapeFeather', quality: 3,
          note: 'Still no light melee set — the Feather Cape is the real upgrade here: no fall damage in the one biome built out of cliffs. Very weak to Fire, so pair it with Barley Wine.',
        },
        weapon: { code: 'KnifeSkollAndHati', quality: 2, note: 'The sleeper pick — 4× parry, 10× backstab, and fast enough to fill adrenaline. An Arbalest opens from a ledge before you close.' },
      },
      heavy: {
        foods: ['MisthareSupreme', 'HoneyGlazedChicken', 'MushroomOmelette'],
        armor: {
          label: 'Carapace', pieces: ['HelmetCarapace', 'ArmorCarapaceChest', 'ArmorCarapaceLegs'],
          cape: 'CapeFeather', quality: 2,
          img: '/img/guide/mistlands/armor-carapace.webp',
          shot: 'Character in full Carapace armour with Feather cape, mist and glowing wisp.',
          note: 'Swap the chest back to a Root Harnesk against anything that leads with Pierce — it is still worth the armour it costs.',
        },
        weapon: { code: 'SwordMistwalker', quality: 2, note: 'Frost, Spirit and Slash together, and strong enough to carry into Ashlands. Krom if you prefer two-handed.' },
        offhand: { code: 'ShieldCarapaceBuckler', quality: 2 },
      },
      magic: {
        foods: ['SeekerAspic', 'YggdrasilPorridge', 'MisthareSupreme'],
        foodNote: 'Two Eitr foods and one Health — a robe will not save you from a mistake.',
        armor: {
          label: 'Eitr-weave', pieces: ['HelmetMage', 'ArmorMageChest', 'ArmorMageLegs'],
          cape: 'CapeFeather', quality: 2,
          img: '/img/guide/mistlands/armor-eitrweave.webp',
          shot: 'Character in full Eitr-weave robes with Feather cape, mist and glowing wisp.',
          note: 'Every piece adds Eitr regen — hood +20%, robe and trousers +40% each — so the full set is the entry price for carrying a staff.',
        },
        weapon: { code: 'StaffFireball', quality: 2, note: 'Frost instead for anything that resists Fire.' },
        offhand: { code: 'StaffShield', quality: 2 },
      },
    },
  },

  ashlands: {
    key: 'ashlands', label: 'Ashlands',
    boss: { trophy: 'TrophyFader', name: 'Fader', prestep: ['BellFragment', 9], offering: ['Bell', 3], drops: [['FaderDrop', 1]] },
    meads: ['BarleyWine', 'MeadHealthMajor', 'MeadBzerker'],
    meadNote: 'Barley Wine is the entry ticket; Berserkir is 20 seconds of burst you spend on a boss.',
    trinket: { code: 'TrinketFlametalEitr', note: '+100 instant Eitr on 70 adrenaline — a staff build feeds it and it feeds the staff back.' },
    builds: {
      light: {
        foods: ['PiquantPie', 'RoastedCrustPie', 'ScorchingMedley'],
        armor: {
          label: 'Ask', pieces: ['HelmetAshlandsMediumHood', 'ArmorAshlandsMediumChest', 'ArmorAshlandsMediumlegs'],
          cape: 'CapeAsh', quality: 2,
          img: '/img/guide/ashlands/armor-ask.webp',
          shot: 'Character in full Ask medium armour with Ashen cape, lava backdrop.',
          note: 'No move penalty, −20% attack stamina, +10% Pierce. The Ashen Cape is a fifth armour piece at 12 base — every other cape gives 1.',
        },
        weapon: { code: 'BowAshlandsRoot', quality: 2, note: 'Root Fang from range; the Ripper crossbow for morgens you would rather not touch.' },
      },
      heavy: {
        foods: ['PiquantPie', 'MashedMeat', 'RoastedCrustPie'],
        armor: {
          label: 'Flametal', pieces: ['HelmetFlametal', 'ArmorFlametalChest', 'ArmorFlametalLegs'],
          cape: 'CapeAsh', quality: 2,
          img: '/img/guide/ashlands/armor-flametal.webp',
          shot: 'Character in full Flametal armour with Ashen cape, lava backdrop.',
          note: '−10% speed for the highest armour in the game, and armour has diminishing returns against big hits. Take it only if you actually tank rather than parry.',
        },
        weapon: { code: 'AxeBerzerkrLightning', quality: 2, note: 'Nothing in the game resists Lightning, so the chain staggers everything. Berserkir mead and these end most things before they finish winding up.' },
      },
      magic: {
        foods: ['MarinatedGreens', 'SizzlingBerryBroth', 'PiquantPie'],
        foodNote: 'Two Eitr and one Health, same as the Mistlands split — the robes are not armour.',
        armor: {
          label: 'Embla', pieces: ['HelmetMage_Ashlands', 'ArmorMageChest_Ashlands', 'ArmorMageLegs_Ashlands'],
          cape: 'CapeAsh', quality: 2,
          img: '/img/guide/ashlands/armor-embla.webp',
          shot: 'Character in full Robes of Embla with Ashen cape, lava backdrop.',
          note: '+50% Eitr regen per piece, and the Ashen Cape carries real armour — wear it even in robes.',
        },
        weapon: { code: 'StaffGreenRoots', quality: 2, note: 'Root summons wall off a charge and poison what is stuck behind them. Staff of Fracturing for damage, Trollstav when you want a body between you and them.' },
        offhand: { code: 'StaffShield', quality: 2 },
      },
    },
  },
};

/** Sheet lookup by any biome spelling the docs might use. */
export function sheetFor(name: string): { sheet: BiomeSheet; index: number } | null {
  const idx = biomeIndex(name);
  if (idx === null) return null;
  const key = Object.keys(BIOME_SHEETS).find(k => biomeIndex(k) === idx);
  return key ? { sheet: BIOME_SHEETS[key], index: idx } : null;
}
