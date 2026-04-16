import type { ItemsPageConfig } from './ItemsPage';
import { iconUrl, biomeIconUrl } from './data';

const CatImg = ({ code }: { code: string }) => (
  <img className="cat-icon" src={iconUrl(code)} alt="" />
);
const BiomeImg = ({ name }: { name: string }) => (
  <img className="cat-icon" src={biomeIconUrl(name)} alt="" />
);

export const weaponsConfig: ItemsPageConfig = {
  page: 'craft',
  pageSlug: 'weapons',
  tipsDoc: 'weapons',
  tipsLabel: 'Weapon mechanics and tips',
  allBgImg: iconUrl('SwordBronze'),
  filter: it =>
    it.page === 'weapons' &&
    it.subcategory !== 'Material' &&
    it.subcategory !== 'Misc',
  subField: 'subcategory',
  tags: [
    { id: 'Unarmed', label: 'Unarmed', icon: <CatImg code="FistBjornClaw" /> },
    { id: 'Swords', label: 'Swords', icon: <CatImg code="SwordMistwalker" /> },
    { id: 'Axes', label: 'Axes', icon: <CatImg code="AxeEarly" /> },
    { id: 'Clubs', label: 'Clubs', icon: <CatImg code="Club" /> },
    { id: 'Spears', label: 'Spears', icon: <CatImg code="SpearFlint" /> },
    { id: 'Knives', label: 'Knives', icon: <CatImg code="KnifeChitin" /> },
    { id: 'Polearms', label: 'Polearms', icon: <CatImg code="AtgeirIron" /> },
    { id: 'Bows', label: 'Bows', icon: <CatImg code="BowFineWood" /> },
    { id: 'Staves', label: 'Staves', icon: <CatImg code="StaffFireball" /> },
    { id: 'Pickaxes', label: 'Pickaxes', icon: <CatImg code="PickaxeIron" /> },
    { id: 'Ammo', label: 'Ammo', icon: <CatImg code="ArrowIron" /> },
    { id: 'Tools', label: 'Tools', icon: <CatImg code="Hammer" /> },
  ],
  sort: (a, b) => {
    const da = combatDamage(a.damages);
    const db = combatDamage(b.damages);
    if (da !== db) return db - da;
    return (a.name || a.code).localeCompare(b.name || b.code);
  },
};

export const gearConfig: ItemsPageConfig = {
  page: 'armor',
  pageSlug: 'gear',
  tipsDoc: 'gear',
  tipsLabel: 'Gear mechanics and tips',
  allBgImg: iconUrl('ArmorIronChest'),
  filter: it => it.page === 'armor',
  subField: 'subcategory',
  tags: [
    { id: 'Shields', label: 'Shields', icon: <CatImg code="ShieldIronBuckler" /> },
    { id: 'Helmets', label: 'Helmets', icon: <CatImg code="HelmetIron" /> },
    { id: 'Chest', label: 'Chest', icon: <CatImg code="ArmorIronChest" /> },
    { id: 'Legs', label: 'Legs', icon: <CatImg code="ArmorIronLegs" /> },
    { id: 'Capes', label: 'Capes', icon: <CatImg code="CapeWolf" /> },
    { id: 'Trinkets', label: 'Trinkets', icon: <CatImg code="TrinketSilverDamage" /> },
    { id: 'Utility', label: 'Utility', icon: <CatImg code="BeltStrength" /> },
  ],
  sort: (a, b) => {
    const va = a.armor?.base ?? a.block?.power ?? 0;
    const vb = b.armor?.base ?? b.block?.power ?? 0;
    if (va !== vb) return vb - va;
    return (a.name || a.code).localeCompare(b.name || b.code);
  },
};

export const foodConfig: ItemsPageConfig = {
  page: 'food',
  pageSlug: 'food',
  tipsDoc: 'consumable',
  tipsLabel: 'Food & mead mechanics',
  allBgImg: iconUrl('Bread'),
  filter: it => it.page === 'food',
  subField: 'subcategory',
  tags: [
    { id: 'Forage', label: 'Pick/Grow', icon: <CatImg code="Cultivator" /> },
    { id: 'CookingStation', label: 'Cooking', icon: <CatImg code="piece_cookingstation" /> },
    { id: 'IronCooking', label: 'Iron Cooking', icon: <CatImg code="piece_cookingstation_iron" /> },
    { id: 'Cauldron', label: 'Cauldron', icon: <CatImg code="piece_cauldron" /> },
    { id: 'PrepTable', label: 'Prep Table', icon: <CatImg code="piece_preptable" /> },
    { id: 'StoneOven', label: 'Stone Oven', icon: <CatImg code="piece_oven" /> },
    { id: 'MeadKetill', label: 'Mead Ketill', icon: <CatImg code="piece_MeadCauldron" /> },
    { id: 'Fermenter', label: 'Fermenter', icon: <CatImg code="fermenter" /> },
  ],
  sort: (a, b) => {
    const va = a.food ? (a.food.health || 0) + (a.food.stamina || 0) + (a.food.eitr || 0) : 0;
    const vb = b.food ? (b.food.health || 0) + (b.food.stamina || 0) + (b.food.eitr || 0) : 0;
    if (va !== vb) return vb - va;
    return (a.name || a.code).localeCompare(b.name || b.code);
  },
};

export const comfortConfig: ItemsPageConfig = {
  page: 'comfort',
  pageSlug: 'comfort',
  tipsDoc: 'comfort',
  tipsLabel: 'Comfort mechanics and tips',
  allBgImg: iconUrl('fire_pit'),
  filter: it => it.category === 'Comfort' && !!it.comfort,
  subField: 'comfortGroup',
  tags: [
    { id: 'Fire', label: 'Fire', icon: <CatImg code="hearth" /> },
    { id: 'Bed', label: 'Bed', icon: <CatImg code="piece_bed02" /> },
    { id: 'Seating', label: 'Seating', icon: <CatImg code="piece_throne01" /> },
    { id: 'Table', label: 'Table', icon: <CatImg code="piece_table_round" /> },
    { id: 'Carpet', label: 'Carpet', icon: <CatImg code="rug_deer" /> },
    { id: 'Banner', label: 'Banner', icon: <CatImg code="piece_banner01" /> },
    { id: 'Standalone', label: 'Standalone', icon: <CatImg code="piece_bathtub" /> },
  ],
  sort: (a, b) => {
    const ca = a.comfort ?? 0;
    const cb = b.comfort ?? 0;
    if (ca !== cb) return cb - ca;
    return (a.name || a.code).localeCompare(b.name || b.code);
  },
};

export const enemiesConfig: ItemsPageConfig = {
  page: 'bestiary',
  pageSlug: 'enemies',
  tipsDoc: 'bestiary',
  tipsLabel: 'Creature mechanics and tips',
  allBgImg: iconUrl('TrophyEikthyr'),
  filter: it => it.page === 'bestiary' && !!it.trophyDrop?.hp,
  subField: 'subcategory',
  tags: [
    { id: 'Meadows', label: 'Meadows', icon: <BiomeImg name="Meadows" /> },
    { id: 'Black Forest', label: 'Black Forest', icon: <BiomeImg name="BlackForest" /> },
    { id: 'Swamp', label: 'Swamp', icon: <BiomeImg name="Swamp" /> },
    { id: 'Mountain', label: 'Mountain', icon: <BiomeImg name="Mountains" /> },
    { id: 'Plains', label: 'Plains', icon: <BiomeImg name="Plains" /> },
    { id: 'Ocean', label: 'Ocean', icon: <BiomeImg name="Ocean" /> },
    { id: 'Mistlands', label: 'Mistlands', icon: <BiomeImg name="Mistlands" /> },
    { id: 'Ashlands', label: 'Ashlands', icon: <BiomeImg name="Ashlands" /> },
  ],
  sort: (a, b) => {
    const ha = a.trophyDrop?.hp ?? 0;
    const hb = b.trophyDrop?.hp ?? 0;
    if (ha !== hb) return hb - ha;
    return (a.name || a.code).localeCompare(b.name || b.code);
  },
};

const NON_COMBAT_DMG = new Set(['chop', 'pickaxe', 'damage']);
function combatDamage(damages?: Record<string, number>): number {
  if (!damages) return 0;
  let t = 0;
  for (const k in damages) if (!NON_COMBAT_DMG.has(k)) t += damages[k];
  return t;
}
