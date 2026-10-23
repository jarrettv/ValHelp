// What each biome variant (the game's alt biomes) changes, condensed from
// BIOME_VARIANTS.md for the map's hover card. Keyed by the game's
// AltBiome.m_name; `stars` is its creature level-up (star) chance multiplier.
// `icon` stands in for a map pattern on variants without one: the creature's
// trophy, or the POI icon of the locations it adds.

export interface AltBiomeInfo { blurb: string; stars?: number; icon?: string }

const trophy = (code: string) => `/api/icon/${code}.png`;
const poi = (name: string) => `/img/Poi/${name}.svg`;

export const ALT_BIOME_INFO: Record<string, AltBiomeInfo> = {
  'Mushroom': { blurb: 'Mushrooms to pick.' },
  'Lantern': { blurb: 'Lost lanterns lying about.' },
  'Bones': { blurb: 'Giant bones; poison skeletons.' },
  'Menhir': { blurb: 'Standing stones; skeletons.' },
  'Dark Meadows': { blurb: 'Draugr roam, gloomy weather, a village instead of farms.', stars: 2, icon: trophy('TrophyDraugr') },
  'Peaceful Meadows': { blurb: 'Fireflies; only boars and deer, no greydwarfs, skeletons, trolls or necks.' },
  'Dandelion Meadows': { blurb: 'Dandelions to pick.' },
  'Raspberry Meadows': { blurb: 'Raspberry bushes.' },
  'Smalltree Meadows': { blurb: 'Small beeches and shrubs; necks by the water.' },
  'Birch Meadows': { blurb: 'Birches and oaks; more deer.' },
  'Troll Black Forest': { blurb: 'Trolls.', icon: trophy('TrophyFrostTroll') },
  'Root Black Forest': { blurb: 'Roots and surprise greydwarfs; elite greydwarfs, no skeletons.' },
  'Ruin Black Forest': { blurb: 'Stone wall ruins and tower ruins.', icon: poi('stoneruins') },
  'Rock Black Forest': { blurb: 'Boulders, fewer firs, no troll caves.', stars: 2 },
  'Pinetree Black Forest': { blurb: 'Pines instead of firs.', stars: 2 },
  'Blueberry Black Forest': { blurb: 'Blueberry bushes.' },
  'Kalhygge Black Forest': { blurb: 'Clear-cut: stumps, no trees.' },
  'Hut Swamp': { blurb: 'Swamp huts and wooden paths; wraiths.', icon: poi('pier') },
  'Bog Swamp': { blurb: 'Evil statues and dead trees; abominations.' },
  'Bat Swamp': { blurb: 'Bats.' },
  'Abomination Swamp': { blurb: 'Abominations.' },
  'Wolf Mountain': { blurb: 'Wolf packs, no drakes or skeletons.', stars: 2, icon: trophy('TrophyWolf') },
  'Drake Mountain': { blurb: 'Drakes, no wolves or skeletons.', stars: 2, icon: trophy('TrophyHatchling') },
  'Fortress Mountain': { blurb: 'Stone ruins and a tower; skeletons and stone golems.', stars: 3, icon: poi('stonetowerruinsleet') },
  'Lox Plains': { blurb: 'Lox herds; no fulings, fuling camps or towers.', icon: trophy('TrophyLox') },
  'Goblin Plains': { blurb: 'Fulings and extra camps; no lox or deathsquitos.', stars: 2, icon: trophy('TrophyGoblin') },
  'Death Plains': { blurb: 'Deathsquitos and tar pits; no lox, fulings or camps.', stars: 2, icon: trophy('TrophyDeathsquito') },
  'Rockless Mistlands': { blurb: 'Fewer cliffs and rocks.' },
  'Trees Mistlands': { blurb: 'Ygga shoots and roots.' },
  'Swords Mistlands': { blurb: 'Giant swords and helmets.' },
  'Hare Mistlands': { blurb: 'Hares.', icon: trophy('TrophyHare') },
  'BroodSwarm Mistlands': { blurb: 'Seeker brood swarms.', icon: trophy('TrophySeeker') },
};

/// Readable biome names for the card header (the game's Heightmap.Biome names).
export const BIOME_NAMES: Record<string, string> = {
  Meadows: 'Meadows', BlackForest: 'Black Forest', Swamp: 'Swamp', Mountain: 'Mountain',
  Plains: 'Plains', Mistlands: 'Mistlands', AshLands: 'Ashlands', DeepNorth: 'Deep North', Ocean: 'Ocean',
};
