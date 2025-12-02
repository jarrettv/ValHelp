// Material data with display names and icon mappings
// Icons would typically be served from /img/materials/ on the API server
// For now, we use a placeholder SVG for materials without icons

export type Material = {
  name: string;
  code: string;
  icon?: string;
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

export default materials;
