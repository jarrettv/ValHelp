 # 1.0.21

 I compared 1.0.20 against 1.0.21 (released today, Steam build 26249040) directly from the game files, so I didn't need
  the patch notes. If you send them, I'll check them against what I found. It's a small patch: 34 files changed in the
  main game code, and only about 50 game objects changed in the data (300 counting the torches inside each location). No
  items, creatures, locations or translated text were added or removed.

## Recipes
  - Unbaked Poteitr, Kale Chips and Oven Pancake are now made at the Food Preparation Table, level 1. Before, they
    needed the Cauldron at level 7, 6 and 6.
  - Gold mage hood upgrades (HelmetGoldMage) no longer cost a Moose trophy per level. The trophy is still needed to
    craft it.
  - The tooltips on those three uncooked foods all pointed at Lox Pie. They now show their own cooked result.

## Trees (Deep North firs: FirTree_big, SnowFirTree, SnowFirTree 2)
  - When the standing tree falls (50% chance) it now drops 2–3 items instead of 1–2. Frost fir cones replace normal fir
    cones, at 1–2 per stack instead of 1.
  - Each half log still drops 10 items, but frost fir cones are gone from the logs. The split was about 2 Frostwood, 4
    Wood and 4 frost fir cones; it's now about 5 Frostwood and 5 Wood. That's roughly 2.5× the Frostwood per tree.

## Combat
  - Moose and Spirit Moose: horn, horn-sweep and hoof reach drops from 5.5 to 4.0.
  - Frost troll punches (trollsnow_punch): tool tier drops from 6 to 4, so they can break less.
  - Yagluth-aspect nova (aspect_GoblinKing_Nova): fire damage halved, 250 → 125.
  - Gold two-handed sword (THSwordGold, plus its BloodLightning and FrostFire versions): m_lowerDamagePerHit is turned
    off. I read that as it no longer losing damage when one swing hits several targets.
  - Deep North boss chain attacks (fx_frozenking_*): screen shake is weaker and reaches 30 m instead of 50 m. Two of the
    impacts had a duplicate shaker, which is removed.

## World
  - Spirit-caller wolves (Wolf_spiritcaller) no longer breed.
  - Snow walls in north villages (WallSnow1–4) can now be destroyed: 100 HP, any tool can break them, and there's a
    snow-burst effect.
  - Swamp huts (SwampHut1, SwampHut1_1) gain a bench with 3 seats.
  - Torches and braziers are quieter, with faster fade in and out.

## Fixes in the game code

  - Item frames and armor stands: putting up an item you're wearing no longer saves it as still worn.
  - Cooking stations: the item that comes out is credited to whoever put it in, not whoever picks it up.
  - Building support: cached support checks are fixed (it used to require support to strictly increase, and recounted
    wrongly). This should cut down on needless support recalculation and collapses.
  - Slippery ground: the ice check was wrong (it tested the raw layer number, not a bitmask), so ice and slippery ground
    now work as intended.
  - Death penalty: the countdown on the soft-death status effect now resyncs to the real remaining cooldown.
  - Stat-based achievements: they now read stats from the right difficulty level. "Big Fish" now needs both a quality-4
    and a quality-5 fish. Forest Troll trophies were taken off the list of items left out of item achievements.
  - Ship sail: the sound and effect play only when someone is steering, and a debug log line is gone.
  - Map: double-clicking a boss pin no longer opens pin editing.
  - Menus: timescale now goes up to 5. Gamepad motion controls are off by default.
  - Saves and stability: the world list refreshes before you start a world, save files with invalid paths are cleaned
    up, and there are several null-crash guards (feast, chat, damage text, shield dome, grappling).