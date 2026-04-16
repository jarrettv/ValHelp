export type VhRecipeResource = {
  item: string;
  amount: number;
  perLevel?: number;
};

export type VhRecipe = {
  station?: string;
  stationLevel?: number;
  resources?: VhRecipeResource[];
};

export type VhItem = {
  code: string;
  name?: string;
  description?: string;
  type?: string;
  category?: string;
  weight?: number;
  maxStack?: number;
  maxQuality?: number;
  value?: number;
  teleportable?: boolean;

  page?: 'weapons' | 'armor' | 'food' | 'bestiary' | string;
  subcategory?: string;
  hasIcon?: boolean;
  hidden?: boolean;
  speedrun?: boolean;

  skill?: string;
  toolTier?: number;

  damages?: Record<string, number>;
  damagesPerLevel?: Record<string, number>;
  knockback?: number;
  backstab?: number;

  block?: { power: number; force?: number; forcePerLevel?: number; parryBonus?: number };
  durability?: { max: number; perLevel?: number; repairable?: boolean };

  armor?: { base?: number; perLevel?: number };
  modifiers?: Record<string, number>;

  food?: { health: number; stamina: number; eitr?: number; regen?: number; duration?: number };

  comfort?: number;
  comfortGroup?: string;

  trophyDrop?: { hp: number; creature?: string };
  trinket?: { biome?: string };
  meadFinished?: string;

  recipe?: VhRecipe;

  // Allow extra fields without breaking
  [key: string]: unknown;
};

export type VhPage = 'weapons' | 'gear' | 'food' | 'comfort' | 'enemies' | 'weather';
