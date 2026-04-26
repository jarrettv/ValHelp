# Food & Mead Mechanics

Jump to [Meads](/consumables#meads) · [Feasts](/consumables#feasts) · [Best Food/Mead per Biome](/consumables#best-food-mead-per-biome) · [Tips](/consumables#tips)

## How Food Works

You can eat up to **three different foods** at once. Each food provides a temporary boost to max HP, Stamina, and/or Eitr, plus a regeneration rate. You cannot eat two of the same food — wait for the icon to flash (partially digested) before re-eating it to refresh.

**You won't starve**, but without food your base 25 HP and 50 Stamina make you extremely fragile. Food is not optional.

### Food Types (Fork Color)

The fork icon on each food item tells you its primary stat:

| {fork:hp:48} | {fork:sta:48}   | {fork:etr:48} | {fork:bal:48} |
|:------------:|:---------------:|:-------------:|:-------------:|
| HP-focused   | Stamina-focused | Eitr-focused  | Balanced      |

### Effect Decay

Food buffs decay slowly at first, then rapidly near expiry: `current = base × (remaining / duration)^0.3`

At 50% duration remaining you still have ~81% of the buff. At 10% remaining you're down to ~50%. Re-eat before the icon starts flashing to stay topped off.

### Why Food Matters for Combat

* {fork:hp} **Max HP directly affects your stagger threshold** (40% of max HP). Higher HP = harder to stagger through a block. Shield users need HP food.
* {fork:sta} **Stamina** fuels dodging, blocking, attacking, and running. Dodge-focused players want Stamina food.
* {fork:etr} **Eitr** is the mana pool for magic. Spellcasters need Eitr food.

A typical combat loadout is **2** {fork:hp} **+ 1** {fork:sta} for melee, or **1** {fork:hp} **+ 1** {fork:sta} **+ 1** {fork:etr} for hybrid magic builds.

## Meads

Meads are brewed at a **Mead Ketill** (base) then fermented in a **Fermenter** (2 in-game days / 1 real hour), yielding 6 bottles per batch (3 for Berserkir). They provide instant heals, resistance buffs, and utility effects.

### Cooldown Groups

Meads within the same group share a cooldown — you can't chain Minor then Medium Healing back-to-back:
* **Healing group:** Minor, Medium, Major, Lingering
* **Stamina group:** Minor, Medium, Lingering
* **Eitr group:** Minor, Lingering

Resistance meads and utility meads have independent cooldowns.

### Top Meads

| Mead                  | Duration | Effect                | When to Use                                            |
|-----------------------|:--------:|-----------------------|--------------------------------------------------------|
| [MeadPoisonResist]@"Poison Resist" |  10 min  | Poison Very Resistant | Useful in Swamp. Situational in other biomes           |
| [BarleyWine]@"Barley Wine"       |  10 min  | Fire Resistant        | Required with Root armor, Feather Cape, or in Ashlands |
| [MeadFrostResist]@"Frost Resist"  |  10 min  | Frost Resistant       | Mountains without frost-resist gear                    |
| [MeadHealthMajor]@"Major Heal"    | 2 min CD | +125 HP over 10s      | Emergency heal in combat                               |
| [MeadStaminaMedium]@"Medium Stam"   | 2 min CD | +160 Stamina instant  | Clutch stamina recovery mid-fight                      |
| [MeadHasty]@"Ratatosk" |  10 min  | +15% speed            | Overland travel, speed runs                            |

### Situational Meads

| Mead                 | Duration | Effect                          | When to Use                              |
|----------------------|:--------:|---------------------------------|------------------------------------------|
| [MeadStaminaLingering]@"Lingering Stam"    |  5 min   | Stamina regen +25%              | Exploration, mining, woodcutting         |
| [MeadEitrLingering]@"Lingering Eitr"      |  5 min   | Eitr regen +25%                 | Extended magic combat, boss fights                    |
| [MeadLightfoot]@"Lightfoot"            |  10 min  | +20% jump, -30% jump stamina    | Mountain & Mistlands traversal           |
| [MeadStrength]@"Troll Endurance"      |  5 min   | +250 carry weight (2 min CD)    | Ore runs, base building                  |
| [MeadSwimmer]@"Vananidir" |  5 min   | -50% swim stamina               | Ocean crossings without a boat           |
| [MeadBzerker]@"Berserkir"            |   20s    | -75% stam, physical weak (2 min CD) | Boss fights, DPS buff                    |

## Feasts

Feasts are special balanced foods crafted at the Prep Table. They provide equal HP and Stamina (and sometimes Eitr), have **50-minute duration** — the longest of any food — and yield **10 servings** per craft. They use the boss trophy spice from their biome. [See Prep Table for a list of feasts](/guides/food/preptable)

Feasts are excellent for **exploration, building, and sailing** where you want long-lasting balanced stats without micromanaging food timers. For combat, dedicated HP/Stamina foods still provide higher individual stats.

## Best Food/Mead per Biome

| Biome | Best Picks |
|-------|-----------|
| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | [CookedMeat]* **Cooked Meat** (HP) + [NeckTailGrilled]* **Grilled Neck Tail** (HP) + **Raspberries or Mushroom** (Stamina). Don't overcook boar meat and neck tails — raw versions are needed for later recipes. Cooked deer meat is fine to cook freely. |
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | [DeerStew]* **Deer Stew** (HP 45/Stam 15) + [MinceMeatSauce]* **Minced Meat Sauce** (HP 40/Stam 13) + [CarrotSoup]* **Carrot Soup** (Stam 45/HP 15). Start a carrot farm early — carrots also tame boars. Queens Jam is a cheap alternative. |
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | [Sausages]* **Sausages** (HP 55/Stam 18) + [TurnipStew]* **Turnip Stew** (Stam 55/HP 18) + **Serpent Stew** (HP 80/Stam 26) if available. **Poison Resistance Mead** is encouraged. Start a turnip farm. Save serpent meat for boss fights if supply is low. |
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | [WolfMeatSkewer]* **Wolf Skewer** (HP 65/Stam 21) + [OnionSoup]* **Onion Soup** (Stam 60/HP 20) + **Serpent Stew** or **Eyescream** (Stam 65/HP 21). Onion Soup doesn't need a high-tier cauldron — cook it before finding silver. Build a large onion farm. |
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | [LoxPie]* **Lox Meat Pie** (HP 75/Stam 24) + [BloodPudding]* **Blood Pudding** (Stam 75/HP 25) + **Bread** (Stam 70/HP 23) or **Fish Wraps** (HP 70/Stam 23). Start growing flax and barley. Tame lox with cloudberries — their meat stays relevant through Mistlands. |
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | [MisthareSupreme]* **Misthare Supreme** (HP 85/Stam 28) + [MushroomOmelette]* **Mushroom Omelette** (Stam 85/HP 28). **Eitr builds:** add **Yggdrasil Porridge** (Eitr 80) or **Seeker Aspic** (Eitr 85). **Stuffed Mushroom** (Eitr 75) works from the oven. Farm Jotun Puffs and Magecaps for Ashlands prep. |
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | [PiquantPie]* **Piquant Pie** (HP 105/Stam 35) or **Mashed Meat** (HP 100/Stam 34) + [RoastedCrustPie]* **Roasted Crust Pie** (Stam 100/HP 34) or **Scorching Medley** (Stam 95/HP 32). **Eitr builds:** **Marinated Greens** (Eitr 95) or **Sizzling Berry Broth** (Eitr 85). **Fire Resistance Barley Wine** is recommended. |

## Tips

* **Always eat three foods.** Even cheap food is vastly better than empty slots
* **Re-eat when icons flash.** The buff drops sharply in the last 10% of duration
* **Carry a healing mead.** Medium or Major Healing is your emergency button — food regen alone won't save you from burst damage
* **Match food to activity.** Exploration/building: balanced or Stamina-heavy. Combat: HP-heavy. Magic: include at least one Eitr food
* **Don't ignore the cauldron.** Crafted foods provide 2-3× the stats of basic cooked meats. Upgrade your cauldron as soon as possible each biome
* **Farm early, farm often.** Carrots (Black Forest), Turnips (Swamp), Onions (Mountain), Barley/Flax (Plains) — every biome introduces a crop that becomes useful. Get those seeds in the ground ASAP
* **Feasts clear inventory.** 50-minute duration makes it so you don't need to take food with you and clear up 3 inventory spots
* **Resistance meads override armor weaknesses.** Drinking Fire Resistance Barley Wine cancels the Fire weakness from Root armor and Feather Cape
