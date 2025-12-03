// Material data with display names and icon mappings
// Icons are served from /stuff/mats/ on the API server

export type Material = {
  name: string;
  code: string;
  category?: string; // Category folder: material, metal, wood, etc.
};

// Map material code to category and file path
type MaterialCategory = "material" | "metal" | "wood" | "food" | "trophy" | "fragments" | "gear";

const materialCategories: Record<string, MaterialCategory> = {
  // Metals
  "Copper": "metal",
  "Tin": "metal",
  "Bronze": "metal",
  "Iron": "metal",
  "Silver": "metal",
  "BlackMetal": "metal",
  "FlameMetal": "metal",
  
  // Wood
  "Wood": "wood",
  "FineWood": "wood",
  "CoreWood": "wood",
  "ElderBark": "wood",
  "YggdrasilWood": "wood",
  
  // Everything else defaults to "material"
};

// Map of material codes (lowercase) to their data
const materials: Record<string, Material> = {
  // Meadows materials
  flint: { name: "Flint", code: "Flint" },
  wood: { name: "Wood", code: "Wood" },
  stone: { name: "Stone", code: "Stone" },
  leather: { name: "Leather Scraps", code: "LeatherScraps" },
  deerhide: { name: "Deer Hide", code: "DeerHide" },
  bones: { name: "Bone Fragments", code: "BoneFragments" },
  honey: { name: "Honey", code: "Honey" },
  queenbee: { name: "Queen Bee", code: "QueenBee" },
  
  // Black Forest materials
  copper: { name: "Copper", code: "Copper" },
  tin: { name: "Tin", code: "Tin" },
  bronze: { name: "Bronze", code: "Bronze" },
  finewood: { name: "Fine Wood", code: "FineWood" },
  core: { name: "Surtling Core", code: "SurtlingCore" },
  coal: { name: "Coal", code: "Coal" },
  
  // Swamp materials
  iron: { name: "Iron", code: "Iron" },
  ooze: { name: "Ooze", code: "Ooze" },
  root: { name: "Root", code: "Root" },
  turnipseed: { name: "Turnip Seeds", code: "TurnipSeeds" },
  ancientbark: { name: "Ancient Bark", code: "ElderBark" },
  chain: { name: "Chain", code: "Chain" },
  ironnails: { name: "Iron Nails", code: "IronNails" },
  wishbone: { name: "Wishbone", code: "Wishbone" },
  
  // Mountain materials  
  silver: { name: "Silver", code: "Silver" },
  obsidian: { name: "Obsidian", code: "Obsidian" },
  wolfpelt: { name: "Wolf Pelt", code: "WolfPelt" },
  dragonteardrop: { name: "Dragon Tear", code: "DragonTear" },
  onionseed: { name: "Onion Seeds", code: "OnionSeeds" },
  wolffang: { name: "Wolf Fang", code: "WolfFang" },
  
  // Plains materials
  flax: { name: "Flax", code: "Flax" },
  barley: { name: "Barley", code: "Barley" },
  cloudberry: { name: "Cloudberries", code: "Cloudberry" },
  blackmetal: { name: "Black Metal", code: "BlackMetal" },
  loxmeat: { name: "Lox Meat", code: "LoxMeat" },
  
  // Mistlands materials
  seekermeat: { name: "Seeker Meat", code: "BugMeat" },
  haremeat: { name: "Hare Meat", code: "HareMeat" },
  jotunpuff: { name: "Jotun Puffs", code: "MushroomJotunPuffs" },
  blackmarble: { name: "Black Marble", code: "BlackMarble" },
  eitr: { name: "Eitr", code: "Eitr" },
  yggdrasilwood: { name: "Yggdrasil Wood", code: "YggdrasilWood" },
  ceramicplate: { name: "Ceramic Plate", code: "CeramicPlate" },
  
  // Ocean materials
  chitin: { name: "Chitin", code: "Chitin" },
};

// Alias mappings for common variations
const aliases: Record<string, string> = {
  "surtlingcore": "core",
  "surtlingcores": "core",
  "cores": "core",
  "leatherscraps": "leather",
  "bonefrags": "bones",
  "bonefragments": "bones",
  "elderbark": "ancientbark",
  "bark": "ancientbark",
  "dragontear": "dragonteardrop",
  "tears": "dragonteardrop",
  "moder tears": "dragonteardrop",
  "wolffangs": "wolffang",
  "wolfpelts": "wolfpelt",
  "chains": "chain",
  "nails": "ironnails",
  "cloudberries": "cloudberry",
  "jotunpuffs": "jotunpuff",
  "yotunpuffs": "jotunpuff",
  "yotunpuff": "jotunpuff",
  "bugmeat": "seekermeat",
  "blackmetals": "blackmetal",
  "ceramicplates": "ceramicplate",
};

export function getMaterial(name: string): Material | undefined {
  const key = name.toLowerCase().replace(/[\s_-]/g, "");
  const aliasedKey = aliases[key] || key;
  return materials[aliasedKey];
}

export function getMaterialDisplayName(name: string): string {
  const material = getMaterial(name);
  return material?.name || name;
}

// Get the icon URL for a material based on its code
export function getMaterialIconUrl(code: string): string {
  const category = materialCategories[code] || "material";
  // Convert code to lowercase snake_case for file path
  const fileName = code.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  return `/stuff/mats/${category}/${fileName}.png`;
}

export default materials;
