# Bestiary

{creaturetypes}

## Star Levels

Non-boss creatures can spawn with star levels that increase their power and loot:

| Level | HP | Damage | Drops |
|-------|:--:|:------:|-------|
| 0 | {bar:33:#c55} Base | {bar:33:#da4} Base | Base amount |
| 1-★ | {bar:66:#c55} ×2 | {bar:50:#da4} ×1.5 | ×2 on starred mobs |
| 2-★★ | {bar:100:#c55} ×3 | {bar:66:#da4} ×2 | ×4 on starred mobs |

Wolves and other creatures with stars are more likely to spawn at **night** and will despawn at dawn if not engaged.

## Trophy Drops & Bad-Luck Protection

Rare creature drops (**30% chance or less**) no longer roll the dice on every kill. Instead the game secretly picks a **kill countdown** for each item, and the item drops when the countdown hits zero.

{trophypity}

The countdown is a random number from 1 to **2 ÷ p** kills. At 10% that's 1 to 20.

:::warn
⚠ **Don't break your own countdown.** It only pays off if you keep killing the *same* creature at the *same* star level in one sitting.

* **Logging out or restarting.** Countdowns live in memory and are never saved. Finish a trophy grind before you log off.
* **Mixing star levels.** The countdown is item and rate specific, so a 1★ Bear does not continue a 0★ Bear's countdown — it discards it and rolls a new one. Avoid 1★ and 2★★ until you finish.
:::

**Fine print:**

* **In multiplayer, each player's game keeps its own countdowns.** The roll happens on whichever player's game controls the creature when it dies.
* **Only creature drops.** Chests, plants and breakable objects work the same as before.
* The world global key `NoPseudoDrops` turns the system off.

## Damage Modifier Boxes

{modbox:Blunt:Immune} Immune (×0)
{modbox:Blunt:VeryResistant} Very Resistant (×0.25)
{modbox:Blunt:Resistant} Resistant (×0.5)
{modbox:Blunt:Normal} Normal (×1)
{modbox:Blunt:Weak} Weak (×1.5)
{modbox:Blunt:VeryWeak} Very Weak (×2)

**Example — Skeleton:** {modbox:Blunt:Weak|Slash:Normal|Pierce:Resistant|Fire:Weak|Frost:Resistant|Lightning:Normal|Poison:Immune|Spirit:Normal} — weak to Blunt and Fire, resistant to Pierce and Frost, immune to Poison

**Nothing in the game resists** Lightning — it's effective against everything and also applies stagger.

## Stagger

Creatures have a **stagger threshold** shown as a percentage of their HP. Deal that much physical or Lightning damage and they stagger, taking **2× damage** during the stun window.

* Bosses have **0% stagger** — they cannot be staggered
* Atgeir spin attack applies **6× stagger** — the best stagger tool in the game
* Lightning damage applies stagger while bypassing all resistances

## Taming

| Creature | Food & Notes |
|----------|--------------|
| <img src="/api/mob/Bestiary_Boar_piggy_0.webp" style="width:40px;height:40px;display:inline-block;vertical-align:middle"> Boar | [Raspberry](1) [Blueberries](1) [Mushroom](1) [Carrot](1) | {biome:meadows}
| <img src="/api/mob/Bestiary_Wolf_cub_0.webp" style="width:40px;height:40px;display:inline-block;vertical-align:middle"> Wolf | [RawMeat](1) [Sausages](1) [NeckTail](1) — starred wolves only spawn at night | {biome:mountain}
| <img src="/api/mob/Bestiary_Lox_Calf_0.webp" style="width:40px;height:40px;display:inline-block;vertical-align:middle"> Lox | [Cloudberry](1) [Barley](1) [Flax](1) — can be ridden with a saddle | {biome:plains}
| <img src="/api/mob/Bestiary_Asksvin_hatchling_0.webp" style="width:40px;height:40px;display:inline-block;vertical-align:middle"> Asksvin | [Fiddleheadfern](1) [Vineberry](1) [MushroomSmokePuff](1) — reproduce via eggs that retain star level | {biome:ashlands}
| <img src="/api/icon/TrophyMoose.png" style="width:40px;height:40px;display:inline-block;vertical-align:middle"> Moose | [Lingonberry](1) — can be ridden with a [SaddleMoose]@"Moose Saddle" | {biome:deepnorth}

**Brew it first.** [MeadTamer]@"Brew of Animal Whispers" is the taming aid — one drink runs **10 minutes**, fermented from [MeadBaseTamer]@"Mead Base: Animal Whispers" (5 [Onion](1), 10 [Carrot](1), 1 [PungentPebbles]@"Pungent Pebbles").

**Tips:** Taming requires the creature to be enclosed (build a pen around it). Stay nearby but don't scare it — sneak if needed. Taming progress resets if the creature takes damage. Once tamed, offspring inherit star levels from parents.

## Faction Behavior

Creatures belong to factions, and **different factions fight each other**. You can exploit this:

* Skeletons fight forest creatures
* Lure a Troll into the swamp — they'll fight each other
* Fulings and Growths will attack each other in the Plains

Let enemies weaken each other before you engage.

| Biome | Key Threats | Strategy |
|-------|-----------|----------|
| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | Greydwarfs and Skeletons at night | Mobs are scared of torches. Bears can pop out of the Black Forest.  | {biome:meadows}
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | Bears, Trolls, Greydwarf swarms | Trolls are weak to Pierce — use a bow. Use Fire on everything. Club the Skeletons. | {biome:blackforest}
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | Draugr archers, Leeches, Blobs | Carry Poison Resistance Mead. Blobs are weak to Blunt and Frost. Draugr are weak to Fire and Spirit. Surtlings die instantly in water. | {biome:swamp}
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | Wolves, Stone Golems, Drakes | Wolves come in packs at night — starred wolves are deadly. Stone Golems are immune to most elements — use Blunt. Drakes are weak to Fire. | {biome:mountain}
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | Deathsquitos, Fuling camps | Deathsquitos have only 10 HP but hit hard — one-shot them with a bow. Fulings are numerous, use AoE (Atgeir spin). Growth is weak to Blunt and Fire. | {biome:plains}
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | Seekers, Gjall, Ticks | Seekers resist all physical damage — use elemental. Gjall are flying and resist Fire. Ticks are weak to Pierce. | {biome:mistlands}
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | Charred, Morgen, Fallen Valkyrie | All Charred are immune to Fire and Poison but weak to Spirit. Morgen resist everything but are weakest to Lightning. Fallen Valkyries are flying. | {biome:ashlands}
| <img src="/data/vh/BiomeDeepNorth.png" style="width:32px;height:32px;display:block"> Deep North | Gammeltroll, Barka | **The biome steps up once you use an [BloodGoldKey]@"Intricate Key" on a Mörkhalla dungeon** — expect heavier patrols afterwards. | {biome:deepnorth}

## General Tips

* **Sneak and pull** — most deaths come from fighting multiple enemies at once. Sneak to pull one at a time, or thin groups with a bow
* **Check resistances before engaging** — Grey damage numbers mean the creature resists that type. Yellow means it's weak. Match your weapon to the enemy
* **Mining and chopping are loud** — they alert nearby creatures. Clear the area first or be ready to fight
* **Night is dangerous** — stronger variants spawn at night. Rest until morning when exploring new biomes
* **Parry everything** — most creatures can be parried for a 2× damage window and zero stamina cost. Learn their attack timing
* **Starred creatures are worth it** — they drop 2-4× loot. Don't flee from them once you're geared
