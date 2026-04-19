# Weapon Mechanics

Jump to [Weapon Types](/weapons#weapon-types) · [Best Weapons per Biome](/weapons#best-weapons-per-biome) · [Tier Rankings](/weapons#tier-rankings)

## Damage Types

**Physical** — Slash, Blunt, Pierce. These apply stagger damage.
**Elemental** — Fire, Frost, Lightning, Poison, Spirit. Only **Lightning** applies stagger damage; the others do not.

**In-game damage color indicators:** Grey = resistant, White = neutral, Yellow = weak (bonus damage).

**Quick matchups:**
* {modbox:Blunt:VeryWeak} **Blunt** excels vs skeletons, blobs, Bonemass.
* {modbox:Slash:VeryWeak} **Slash** excels vs most fleshy mobs. Weak vs blobs, stone golems.
* {modbox:Pierce:VeryWeak} **Pierce** excels vs trolls, wolves, fuelings, ticks. Weak vs blobs, stone golems, skeletons.
* {modbox:Fire:VeryWeak} **Fire** excels vs ghosts, forest creatures, skeletons, The Elder.
* {modbox:Frost:VeryWeak} **Frost** slows enemies on hit. Excels vs bugs, blobs, surtlings, Yagluth.
* {modbox:Lightning:VeryWeak} **Lightning** nothing in the game resists it. Excellent for staggering anything.
* {modbox:Spirit:VeryWeak} **Spirit** only affects undead (skeletons, ghosts, wraiths, draugr). Charred in Ashlands are weak to it.

## Damage Formula

`damage = base × skill_factor × multipliers`

**Skill factor:** Min damage scales 25%→85% (skill 0→100). Max damage scales 55%→100% (skill 0→75+). Average damage at skill 100 is ~2.4× skill 0.

**Armor reduction:** If `armor < damage/2`: lose `damage - armor`. If `armor ≥ damage/2`: lose `damage² / (4 × armor)`. Elemental/poison bypasses physical armor unless stated otherwise.

## Skill Leveling

* Max level 100 per skill. ~+1.5% average damage per level up to 75, then +1.13%
* **Often "cheaper" to skill level than upgrade a weapon**
* **Bows** gain up to **400% draw speed** from leveling — extremely powerful at high skill
* **Spears** and **Knives** are very fast to level-up
* Skill reduces stamina cost by up to **33%** at level 100
* Death penalty = lose 5% skill levels, unless "No Skill Drain"

## Stagger

Physical damage (Slash/Blunt/Pierce) and Lightning accumulate stagger. Fire, Frost, Poison, Spirit do **not**.

When stagger bar fills, the enemy is stunned and takes **2× damage**. Player stagger threshold = 40% of max HP (health food increases this).

**Key multipliers:** Atgeir spin = **6× stagger**, mace secondary = 2–3× stagger. These are why atgeirs can stagger-lock almost anything, especially the Himmin Afl (lightning atgeir) since nothing resists lightning.

## Backstab

Triggers on **unaware** enemies (regardless of direction). Standard weapons: **3×**. Knives: **10×**. Two-handed clubs: **2×**. Bow sneak shot: **3×**. Grants the target 5 minutes backstab immunity.

## Blocking

Block power absorbs damage. Stamina cost scales with how much damage bleeds through: `30 × (damage / block_power)`, up to 10 extra stamina from overflow. **No stamina = full damage taken.** You can only block from the front. Stamina regenerates while blocking.

## Parrying

Timed block within **0.25 seconds** of impact. Multiplies block power by the weapon's **Parry Bonus**. A successful parry **staggers the attacker** (2× damage window) and costs **zero stamina** (since Call to Arms). Visual: red splash + clang sound.

**Parry bonus by class:** Fists {parry:6} (highest), Knives {parry:4}, Bucklers {parry:2.5}, Round shields {parry:1.5}, Tower shields **cannot parry**.

**Staff of Protection bubble** lets you parry anything regardless of parry bonus, max HP, or stagger limits — even 2-star enemies normally impossible to parry.

## Dodge Roll

Grants invulnerability during the animation. Costs 15 stamina (increased by heavy gear speed penalty). **Perfect Dodge** (dodging right as attack lands) refunds stamina.

## Attack Chains

Most melee weapons have a 3-hit combo. The **3rd hit deals double damage** and +20% knockback. Plan your attacks around landing the 3rd hit on staggered enemies for maximum burst.

## Weapon Types

| Class        | Speed     | Move Penalty | Parry | Notes                                            |
|--------------|-----------|--------------|-------|--------------------------------------------------|
| Knives       | Very fast | 0%           | {parry:4}    | 10× backstab. Slash + Pierce.                    |
| Fists        | Fast      | 0%           | {parry:6}    | Highest parry bonus. Pairs with Fenris set.      |
| Swords       | Medium    | -5%          | —     | Reliable Slash damage, good all-rounder.         |
| Spears       | Medium    | -5%          | —     | Pierce + ranged throw. Fastest skill leveling.   |
| Clubs/Maces  | Medium    | -5%          | —     | High knockback. Blunt is widely effective.       |
| Axes (1H)    | Medium    | -5%          | —     | Double duty: Slash + woodcutting.                |
| Polearms     | Slow      | -5%          | —     | Long reach Pierce. Spin = 6× stagger AoE†.        |
| Great Swords | Slow      | -5%          | —     | Slower but Massive Slash damage.                  |
| Battle Axes  | Slow      | -20%         | —     | AoE† Slash cleave. Heavy movement penalty.        |
| Sledges      | Slow      | varies       | —     | AoE† Blunt ground slam. Great for dungeons.  |
| Bows         | —         | -5%          | —     | Pierce, draw speed scales up to 400% with skill. |
| Crossbows    | —         | varies       | —     | High burst, slow reload. No skill scaling.       |
| Staves       | —         | -5%          | —     | Eitr-based. Cast while moving/sprinting.         |

†AoE attacks go through walls/ground, sledges create 8m sphere of damage

## Adrenaline

Fill the bar by landing attacks, parrying (5 per parry), perfect dodges, and using Forsaken Powers. **Fast weapons fill faster.** See [Trinkets](/gear#trinkets) for more details.

## Best Weapons per Biome

| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | [SpearFlint]* **Flint Spear.** Cheap, melee + ranged, fast skill leveling. **Early Axes** are OP and chop finewood. [Club]* **Club** at level 4 is strong Blunt early. |
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | [KnifeChitin]* **Abyssal Razor** if you find chitin — iron-tier damage, fast adrenaline, {parry:4} parry. Otherwise [AtgeirBronze]* **Bronze Atgeir** — spin crowd-controls greydwarfs and stagger-locks trolls. [FistBjornClaw]* **Fists of the Bear** offer {parry:6} parry and kick can stagger for many biomes. |
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | [BowHuntsman]* **Huntsman Bow.** Only bow with reduced noise (4m vs 15m), assassinate without alerting. Stays relevant through Plains. Melee: [MaceIron]* **Iron Mace** — most swamp creatures are weak to Blunt including boss. |
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | [FistFenrirClaw]* **Flesh Rippers** (fists). Pairs well with Fenris set. Alt: [SwordSilver]* **Silver Sword** and [MaceSilver]* **Frostner** — both stay viable into Ashlands via Frost slow + Spirit damage. |
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | [AtgeirBlackmetal]* **Blackmetal Atgeir.** Spin attack dominates multi-target fights, long range pokes lox safely. Alt: [MaceNeedle]* **Porcupine** (Blunt+Pierce) and [FistBjornUndeadClaw]* **Vilebone Maulclaws** (Slash+Pierce fists). |
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | **Magic:** [StaffShield]* **Staff of Protection** (OP bubble, parry anything) + [StaffIceShards]* **Staff of Frost** (fast cast, slows, adrenaline gen). **Melee:** [SwordMistwalker]* **Mistwalker** (Frost+Spirit+Slash, strong into Ashlands). Sleeper: [KnifeSilver]* **Skoll and Hati** knives. |
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | **Magic:** [StaffGreenRoots]* **Staff of the Wild** (root summons, Poison, scales with difficulty). **Melee:** [AxeBerzerkr]* **Lightning Berzerkir Axes** (chain Lightning vs swarms). Alt: [SpearSplitner]* **Splitnir Spear** — target Askvin and flying, quick adrenaline procs |


## Tier Rankings

**OP Tier:** Paws of the Bear, Staff of Protection, Staff of the Wild, Staff of Embers, Himmin Afl (lightning atgeir)

**A Tier:** Mistwalker, Frostner, Iron Atgeir, all Spears, Huntsman bow and above, Bronze Atgeir, Abyssal Razor, 2-handed Clubs (for dungeons)

**Key insights:** Iron Atgeir is so strong you can skip the Blackmetal Atgeir entirely. Frostner (mountain weapon) stays competitive through Ashlands. Paws of the Bear when paired with a spear can be effective all the way into the Mistlands. Bows are A-tier minimum — commit to the skill for massive draw speed scaling. Staff of Protection is worth using even in melee builds (swap one health food for eitr food to cast bubble).