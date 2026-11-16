// Data for the speedrun boss overlay (Obs2Bosses): what api/obs/run/{code} returns, and a sample run.

export interface BossStep { kind: 'gather' | 'craft' | 'ready'; label: string; item: string; have: number; need: number; done: boolean }
export interface BossProgress { key: string; name: string; icon: string; phase: number; found: boolean; defeated: boolean; steps: BossStep[] }
export interface RunProgress { characterId: number; character: string; savedAt: string; playSeconds: number; bosses: BossProgress[] }

const st = (kind: BossStep['kind'], label: string, item: string, have: number, need: number): BossStep =>
  ({ kind, label, item, have, need, done: have >= need });

/** Sample run for /obs2/bosses/demo and the setup preview: three down, the rest at different stages. */
export const DEMO_RUN: RunProgress = {
  characterId: 0, character: 'Demo', savedAt: new Date().toISOString(), playSeconds: 0,
  bosses: [
    { key: 'eikthyr', name: 'Eikthyr', icon: 'TrophyEikthyr', phase: 1, found: true, defeated: true, steps: [st('gather', 'Deer Trophy', 'TrophyDeer', 2, 2)] },
    { key: 'gdking', name: 'The Elder', icon: 'TrophyTheElder', phase: 1, found: true, defeated: true, steps: [st('gather', 'Ancient Seed', 'AncientSeed', 3, 3)] },
    { key: 'bonemass', name: 'Bonemass', icon: 'TrophyBonemass', phase: 1, found: true, defeated: false, steps: [st('gather', 'Withered Bone', 'WitheredBone', 7, 10)] },
    { key: 'dragon', name: 'Moder', icon: 'TrophyDragonQueen', phase: 1, found: true, defeated: true, steps: [st('gather', 'Dragon Egg', 'DragonEgg', 3, 3)] },
    { key: 'goblinking', name: 'Yagluth', icon: 'TrophyGoblinKing', phase: 2, found: true, defeated: false, steps: [st('gather', 'Fuling Totem', 'GoblinTotem', 2, 5)] },
    { key: 'seekerqueen', name: 'The Queen', icon: 'TrophySeekerQueen', phase: 2, found: true, defeated: false, steps: [st('gather', 'Sealbreaker Fragment', 'DvergrKeyFragment', 9, 9), st('craft', 'Sealbreaker', 'DvergrKey', 1, 1)] },
    { key: 'fader', name: 'Fader', icon: 'TrophyFader', phase: 2, found: false, defeated: false, steps: [st('gather', 'Bell Fragment', 'BellFragment', 4, 9), st('craft', 'Bell', 'Bell', 0, 3)] },
    { key: 'frozenking', name: 'Kall Fimbulbringer', icon: 'Bestiary_FrozenKing', phase: 3, found: false, defeated: false, steps: [st('gather', 'Jotun Invasion', 'HatefulBlood', 1, 3), st('ready', 'Malicious Blood', 'HatefulBlood', 1, 3)] },
  ],
};
