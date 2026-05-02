# Gear Mechanics

Jump to [Set Bonuses](/gear#armor-set-bonus-effects) · [Shields](/gear#shields) · [Capes](/gear#capes) · [Trinkets](/gear#trinkets) · [Best Gear per Biome](/gear#best-gear-per-biome) · [Tips](/gear#tips)

## Armor

You get armor from helmets, chest, legging, and capes while equipped. Equip the [TrinketIronHealth](1) and you can get another +20 armor upon adrenaline trigger.

### Damage Reduction Formula

Armor reduces incoming damage using a two-tier formula:

* **If armor < damage/2:** you lose `damage - armor`
* **If armor >= damage/2:** you lose `damage² / (4 × armor)`

The second case means stacking armor has **diminishing returns** — doubling your armor does not halve damage. Against small hits, high armor is very effective. Against large hits, it barely matters. This is why the armor stat on gear is "overrated" — a 100-damage hit against 60 armor still deals 42 damage.

### What Matters More Than Armor

1. **Blocking and Parrying** — a successful parry negates all stamina cost and staggers the attacker for a 2× damage window. Even moderate block power can nullify hits that armor would barely dent
2. **Good Food** — a higher HP with a lower armor is more effective at reducing damage (see formula above)
3. **Damage resistances** — boss powers and items like [ArmorRootChest](1) (Pierce Resistant) or [TrinketSilverResist](1) (all physical Resistant) halve entire damage types

| Category                                               |  Armor   | Move Penalty | Best For                   |
|--------------------------------------------------------|:--------:|:------------:|----------------------------|
| Heavy (Bronze, Iron, Wolf, Padded, Carapace, Flametal) | Highest  |  -10% total  | Players who tank hits      |
| Medium (Bear, Root, Vilebone, Ask)                     | Moderate |  0% to -4%   | Balanced players           |
| Light (Troll, Fenris, Eitr-weave, Embla)               |  Lowest  |  0% to +9%   | Dodge/parry players, mages |

### Armor Set Bonus Effects

Wearing all pieces of a set grants extra effects on top of each piece's individual bonuses.

| Set | Pieces & Effects |
|-----|--------|---------|
| Sneaky (Troll) | [HelmetTrollLeather](1) [ArmorTrollLeatherChest](1) [ArmorTrollLeatherLegs](1) [CapeTrollHide](1) <br> **+15 Sneak skill** |
| Berserk (Bear) | [HelmetBerserkerHood](1) [ArmorBerserkerChest](1) [ArmorBerserkerLegs](1) <br> **+30% Health regen, +15% Stamina regen, +10% Slash, +10% Chop**, Slightly weak (+25%) vs Blunt, Slash and Pierce |
| Ranger (Root) | [HelmetRoot](1) [ArmorRootChest](1) [ArmorRootLegs](1) <br> **+15 Bow skill**, Pierce resistant (chest), Poison resistant (helmet), Weak vs Fire |
| Fenris Blessing | [HelmetFenring](1) [ArmorFenringChest](1) [ArmorFenringLegs](1) <br> +9% movement speed, Frost resistent (chest), Fire resistant, **+15 Unarmed skill** |
| Vilebone Wrath | [HelmetBerserkerUndead](1) [ArmorBerserkerUndeadChest](1) [ArmorBerserkerUndeadLegs](1) <br> **+20% Health regen, +40% Stamina regen**, Slightly weak (+25%) vs Blunt, Slash and Pierce, **+20% Blunt, +20% Pierce** |
| Endurance (Ask) | [HelmetAshlandsMediumHood](1) [ArmorAshlandsMediumChest](1) [ArmorAshlandsMediumlegs](1) <br> **-10% run stamina, -10% jump stamina, -20% attack stamina**, +10% Pierce |

## Shields

Shields occupy the off-hand slot and are used with one-handed weapons. The shield's block power and parry bonus **replace** the weapon's own values. There are 3 types of shields:

| Type        |  Blocking   |    Parry    |  Force   |    Move | Playstyle                  |
|-------------|:-----------:|:-----------:|:--------:|--------:|----------------------------|
| **Buckler** |   Lowest    | {parry:2.5} |   Low    | **-5%** | Parry-focused              |
| **Round**   |   Medium    | {parry:1.5} |  Medium  | **-5%** | Balanced block and parry   |
| **Tower**   | **Highest** |     N/A     | **High** |    -10% | Tank hits w/ big knockback |

All shields max at quality 3.

### Blocking Mechanics

1. Raw damage is first reduced by the shield's block power (+ skill bonus)
2. Up to 10 stamina is consumed proportional to leftover damage vs raw damage
3. If leftover damage fills the **stagger bar** (40% of max HP), block fails and you stagger
4. If block succeeds, leftover damage is then reduced again by your body armor

**Blocking skill** adds +0.5% block power per skill level (up to +50% at level 100).

**Block force** is knockback dealt to melee attackers on block. Scales 50–100% based on block power used.

### Parrying

Timed block within **0.25 seconds** of impact. Multiplies block power by the parry bonus. Since Call to Arms:
* Parrying costs **zero stamina**
* Successful parry **staggers the attacker** (2× damage window)
* Only physical + Lightning damage contribute to stagger — Fire, Frost, Poison, Spirit do not

**Parry bonus by source:** Fists {parry:6} > Knives {parry:4} > Bucklers {parry:2.5} > Round Shields {parry:1.5} > Tower Shields **cannot parry**

**Tip:** Parrying is the single strongest defensive mechanic. A Bronze Buckler (16 block × 2.5 = 40 parry armor) with just 20 blocking skill (16 × 1.1 × 2.5 = 44) can parry most Black Forest and Swamp attacks. Invest in parry timing over armor upgrades — it's free defense.

## Capes

Capes generally provide very little armor and since they take a valuable inventory slot, they can be de-prioritized.
However, a cape is a great way to gain Frost protection. It isn't until the late game [CapeAsh](1) do you get any substantial armor.

| Top Capes                   | Base Armor | +/lvl  | Resistance | Notes                                                   |
|-----------------------------|:----------:|:------:|------------|---------------------------------------------------------|
| [CapeLox](1) or [CapeWolf]* |     1      |   +1   | **Frost**  | Requires silver                                         |
| [CapeFeather](1)            |     1      |   +1   | Frost      | **No fall damage**, very weak to Fire                   |
| [CapeAsksvin](1)            |     1      |   +1   | Frost      | **-15% dodge stamina**, wind run (faster with tailwind) |
| [CapeAsh](1)                |   **12**   | **+2** | Frost      | **-10% attack stamina, -20% block stamina**             |

## Trinkets

A single trinket can be equipped at a time. When the adrenaline bar (orange, below stamina) fills to the trinket's threshold, a buff is applied for a duration — both specified by the trinket. After 10 seconds out of combat, adrenaline decays at 1/second but any action below stops the decay.

| Action                | Adrenaline        |
|-----------------------|:------------------------------:|
| Block                 |  {adrenaline} 2                |
| Perfect Block (Parry) |  {adrenaline} 5                |
| Perfect Dodge         |  {adrenaline} 5                |
| Forsaken Power        |  {adrenaline} 10 (Fader: 20)   |
| Hit / Spellcast       |  Varies by weapon (see below)  |
| Stagger an enemy      |  {adrenaline} +3 bonus         |

| Weapon                            |     Primary     |   Secondary    |
|-----------------------------------|:---------------:|:--------------:|
| Knives, Spears                    | {adrenaline} 1  | {adrenaline} 2 |
| Fists, Axes                       | {adrenaline} 1  | {adrenaline} 1 |
| Swords, Clubs                     | {adrenaline} 1  | {adrenaline} 3 |
| Atgeirs, 2H Axes, 2H Swords       | {adrenaline} 2  | {adrenaline} 1 |
| 2H Hammers, Bows, X-bows, Bombs   | {adrenaline} 2  |       —        |
| Staff of Frost                    | {adrenaline} 1  |       —        |
| Staff of Embers, Fracturing, Wild | {adrenaline} 3  |       —        |
| Dundr                             | {adrenaline} 5  |       —        |
| Staff of Protection               | {adrenaline} 6  |       —        |
| Dead Raiser                       | {adrenaline} 10 |       —        |
| Trollstav                         | {adrenaline} 12 |       —        |

**Stamina is king.** You don't need healing if you never get hit. Stamina lets you dodge, parry, block, and attack — all of which prevent damage better than recovering from it.

**Adrenaline cost matters.** Lower adrenaline = more frequent triggers. The Bronze Pendant at 50 adrenaline triggers far more often than Crystal Heart at 80 or Brimstone at 100, making it consistently useful across the entire game.

| Top Trinkets                   | Biome        | {adrenaline} |   Time   | Effect                                                   |
|--------------------------------|--------------|:------------:|:--------:|----------------------------------------------------------|
| [TrinketBronzeStamina](1)      | Black Forest |      50      |   60s    | +25% Stamina regen                                       |
| [TrinketIronStamina](1)        | Swamp        |      60      |   30s    | +15% move speed, +50 instant stamina                     |
| [TrinketBlackStamina](1)       | Plains       |      60      | **120s** | +50% parry bonus, +20 Blocking skill, -50% block stamina |
| [TrinketScaleStaminaDamage](1) | Mistlands    |      75      |   60s    | +10% Slash damage, +100 instant stamina                  |
| [TrinketFlametalEitr](1)       | Ashlands     |      70      |   60s    | +20 Elemental/Blood Magic skill, +100 instant Eitr       |

## Best Gear per Biome

| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | Save your materials. If you have extra deer hide, spend it on the [HelmetLeather]* **Leather Helmet**. No shields yet; focus on dodge rolling and parrying with your weapon. |
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | [ArmorBerserkerChest]* **Bear set** — no move penalty, +30% HP regen, +15% stamina regen, +10% Slash/Chop. [ShieldBronzeBuckler]* **Bronze Buckler** for {parry:2.5} parry. [TrinketBronzeStamina]* **Bronze Pendant** trinket — low adrenaline, +25% stamina regen. Prioritize helmet then legs.|
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | **Hybrid:** [HelmetIron]* + [ArmorRootChest]* + [ArmorIronLegs]* Root Harnesk's Pierce Resistance is the best single armor piece in the game — stays viable into endgame. [ShieldIronBuckler]* **Iron Buckler** for parry. [TrinketIronStamina]* **Nimble Anklet** trinket — speed and stamina counter the rain debuff. |
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | [ArmorFenringChest]* **Fenris set** — only armor that *increases* speed (+9%). Frost Resistant, Fire Resistant, +15 Fist skill synergizes with {parry:6} fist parry. Pairs perfectly with [FistFenrirClaw]* Flesh Rippers. [TrinketSilverDamage]* **Wolf Sight** trinket — +10% Pierce, +20 Bows/Spears skill massively boosts ranged damage. |
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | **Hybrid:** [HelmetPadded]* + [ArmorRootChest]* + [ArmorPaddedGreaves]* — protects against deathquito and fueling spears. [ArmorBerserkerUndeadChest]* **Vilebone set** — no move penalty, +40% stamina regen, +20% Blunt/Pierce damage. [TrinketBlackStamina]* **Evasion Mantle** trinket — 120s duration enables chaining with the parry bonus. |
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | **Magic:** [ArmorMageChest]* **Eitr-weave** (Hood +20%, Robe/Trousers +40% Eitr regen each). **Melee:** [ArmorCarapaceChest]* + [ArmorRootChest]* hybrid. [CapeFeather]* **Feather Cape** removes fall damage and is Frost resistant. [ShieldCarapaceBuckler]* **Carapace Buckler** for {parry:2.5} parry. |
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | [ArmorAshlandsMediumChest]* **Ask set** — no move penalty, -20% attack stamina, +10% Pierce. Pair with [CapeAsh]* **Ashen Cape** (12 armor, -10% attack/-20% block stamina). [ArmorMageChest_Ashlands]* **Embla** for spellcasters (+50% Eitr regen per piece). [TrinketFlametalEitr]* **Jormundling** trinket — +100 instant Eitr on 70 adrenaline, self-sustaining with staves. |

## Tips

**Parry > Armor.** A player in Fenris (+9% speed) with a Buckler who parries every attack takes zero damage. A player in Flametal (-10% speed) who face-tanks hits still takes significant damage despite 114 total armor.

**Lightweight sets are worth it.** Bear and Vilebone trade +25% physical vulnerability for massive stamina regen and damage bonuses — parry consistently and you never take the extra damage.

**Root Harnesk is forever.** Pierce Resistance from a single Swamp chest piece outperforms entire late-game armor sets against the majority of creatures. Consider it in hybrid builds through endgame.

**Ashen Cape is a 5th armor piece.** At 12 base armor (vs 1 for all other capes) plus stamina reduction, it's in a class of its own. Asksvin Cloak is the travel alternative with wind speed and dodge discount.
