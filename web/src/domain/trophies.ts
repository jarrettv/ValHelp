const trophies = [
  {
    name: "Boar",
    biome: "Meadows",
    code: "TrophyBoar"
  },
  {
    name: "Deer",
    biome: "Meadows",
    code: "TrophyDeer"
  },
  {
    name: "Neck",
    biome: "Meadows",
    code: "TrophyNeck"
  },
  {
    name: "Eikthyr",
    biome: "Meadows",
    code: "TrophyEikthyr"
  },
  {
    name: "Greydwarf",
    biome: "Black Forest",
    code: "TrophyGreydwarf"
  },
  {
    name: "Greydwarf Brute",
    biome: "Black Forest",
    code: "TrophyGreydwarfBrute"
  },
  {
    name: "Greydwarf Shaman",
    biome: "Black Forest",
    code: "TrophyGreydwarfShaman"
  },
  {
    name: "Rancid Remains",
    biome: "Black Forest",
    code: "TrophySkeletonPoison"
  },
  {
    name: "Skeleton",
    biome: "Black Forest",
    code: "TrophySkeleton"
  },
  {
    name: "Troll",
    biome: "Black Forest",
    code: "TrophyFrostTroll"
  },
  {
    name: "Bear",
    biome: "Black Forest",
    code: "TrophyBjorn"
  },
  {
    name: "Ghost",
    biome: "Black Forest",
    code: "TrophyGhost"
  },
  {
    name: "Brenna",
    biome: "Black Forest",
    code: "TrophySkeletonHildir"
  },
  {
    name: "The Elder",
    biome: "Black Forest",
    code: "TrophyTheElder"
  },
  {
    name: "Abomination",
    biome: "Swamp",
    code: "TrophyAbomination"
  },
  {
    name: "Blob",
    biome: "Swamp",
    code: "TrophyBlob"
  },
  {
    name: "Draugr",
    biome: "Swamp",
    code: "TrophyDraugr"
  },
  {
    name: "Draugr Elite",
    biome: "Swamp",
    code: "TrophyDraugrElite"
  },
  {
    name: "Leech",
    biome: "Swamp",
    code: "TrophyLeech"
  },
  {
    name: "Surtling",
    biome: "Swamp",
    code: "TrophySurtling"
  },
  {
    name: "Wraith",
    biome: "Swamp",
    code: "TrophyWraith"
  },
  {
    name: "Kvastur",
    biome: "Swamp",
    code: "TrophyKvastur"
  },
  {
    name: "Bonemass",
    biome: "Swamp",
    code: "TrophyBonemass"
  },
  {
    name: "Cultist",
    biome: "Mountain",
    code: "TrophyCultist"
  },
  {
    name: "Drake",
    biome: "Mountain",
    code: "TrophyHatchling"
  },
  {
    name: "Fenring",
    biome: "Mountain",
    code: "TrophyFenring"
  },
  {
    name: "Stone Golem",
    biome: "Mountain",
    code: "TrophySGolem"
  },
  {
    name: "Ulv",
    biome: "Mountain",
    code: "TrophyUlv"
  },
  {
    name: "Wolf",
    biome: "Mountain",
    code: "TrophyWolf"
  },
  {
    name: "Geirrhafa",
    biome: "Mountain",
    code: "TrophyCultist_Hildir"
  },
  {
    name: "Moder",
    biome: "Mountain",
    code: "TrophyDragonQueen"
  },
  {
    name: "Deathsquito",
    biome: "Plains",
    code: "TrophyDeathsquito"
  },
  {
    name: "Fuling",
    biome: "Plains",
    code: "TrophyGoblin"
  },
  {
    name: "Fuling Berserker",
    biome: "Plains",
    code: "TrophyGoblinBrute"
  },
  {
    name: "Fuling Shaman",
    biome: "Plains",
    code: "TrophyGoblinShaman"
  },
  {
    name: "Growth",
    biome: "Plains",
    code: "TrophyGrowth"
  },
  {
    name: "Lox",
    biome: "Plains",
    code: "TrophyLox"
  },
  {
    name: "Vial",
    biome: "Plains",
    code: "TrophyBjornUndead"
  },
  {
    name: "Zil",
    biome: "Plains",
    code: "TrophyGoblinBruteBrosShaman"
  },
  {
    name: "Thungr",
    biome: "Plains",
    code: "TrophyGoblinBruteBrosBrute"
  },
  {
    name: "Yagluth",
    biome: "Plains",
    code: "TrophyGoblinKing"
  },
  {
    name: "Dvergr",
    biome: "Mistlands",
    code: "TrophyDvergr"
  },
  {
    name: "Hare",
    biome: "Mistlands",
    code: "TrophyHare"
  },
  {
    name: "Gjall",
    biome: "Mistlands",
    code: "TrophyGjall"
  },
  {
    name: "Seeker",
    biome: "Mistlands",
    code: "TrophySeeker"
  },
  {
    name: "Seeker Soldier",
    biome: "Mistlands",
    code: "TrophySeekerBrute"
  },
  {
    name: "Tick",
    biome: "Mistlands",
    code: "TrophyTick"
  },
  {
    name: "The Queen",
    biome: "Mistlands",
    code: "TrophySeekerQueen"
  },
  {
    name: "Asksvin",
    biome: "Ashlands",
    code: "TrophyAsksvin"
  },
  {
    name: "Bonemaw",
    biome: "Ashlands",
    code: "TrophyBonemawSerpent"
  },
  {
    name: "Fallen Valkyrie",
    biome: "Ashlands",
    code: "TrophyFallenValkyrie"
  },
  {
    name: "Marksman",
    biome: "Ashlands",
    code: "TrophyCharredArcher"
  },
  {
    name: "Morgen",
    biome: "Ashlands",
    code: "TrophyMorgen"
  },
  {
    name: "Volture",
    biome: "Ashlands",
    code: "TrophyVolture"
  },
  {
    name: "Warlock",
    biome: "Ashlands",
    code: "TrophyWarlock"
  },
  {
    name: "Warrior",
    biome: "Ashlands",
    code: "TrophyCharredMelee"
  },
  {
    name: "Fader",
    biome: "Ashlands",
    code: "TrophyFader"
  },
  {
    name: "Serpent",
    biome: "Ocean",
    code: "TrophySerpent"
  }
];

export default trophies;