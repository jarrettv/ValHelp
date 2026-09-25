# Comfort Mechanics

Comfort is one number, and it buys you one thing: minutes of **Rested**. The rested buff boosts HP regen, Stamina regen, Eitr regen and XP gain, and the game is balanced around having it — so the room you sleep in is worth as much thought as the armour you walk out of it wearing.

## How comfort is counted

Comfort is the sum of three things:

1. **Shelter — +2.** A roof of your own making, or a natural one: a cave mouth, an overhang, a dungeon ceiling.
2. **The best piece in each furniture category — one per category.** Furniture is grouped, and inside a group only the highest-comfort piece counts. Three banners are one banner. A throne next to a bench is a throne.
3. **Every piece with no category at all.** After 1.0 that is just the [piece_maypole]* Maypole and the [piece_xmastree]* Yule Tree, and both stack with each other and with everything else.

Furniture must be within **10 metres** of you, measured in 3D — furniture above or below counts, so multi-floor designs work. Fire sources only count while **lit**.

The number you build to is what the rested timer is priced off:

> **Rested = 7 minutes + 1 minute per point of comfort.**

So a campfire on its own is comfort 1 and 8 minutes; put a roof over it and the same campfire is comfort 3 and 10 minutes.

### Getting the rested bonus

<img src="/data/vh/rested.png" style="float:left;width:48px;height:48px;margin:0 12px 8px 0;image-rendering:pixelated">

Three things have to be true at once: **no hostiles nearby**, you are **in a fire's warmth**, and you are **neither wet nor burning**. Meet all three and the "Resting" effect appears with your comfort value. Hold it for 20 uninterrupted seconds and "Rested" is applied. Break any of the three and the 20 seconds restart.

Without shelter you have to be sitting for the timer to run. **With** shelter it runs while you stand and walk around the room.

Sleeping in a [bed]* skips the wait entirely — you wake rested at the room's comfort level.

### On-the-go

You can place a [fire_pit]* anywhere dry and sit `X` to rest, which is also the cheapest way to stop a dungeon room spawning mobs. [piece_logbench01]* Sitting logs can go down inside dungeons too.

:::biome blackforest
A trader's camp doubles as a rest stop — Hildir, Haldor and the Bog Witch all sit by a fire that counts as yours.
:::

:::biome mountain
In the mountain caves, the [piece_brazierfloor01]* Standing Brazier does the same job. Worth knowing on a long silver run.
:::

## Furniture categories

Eleven categories, each contributing its single best piece. Rows unlock as you reach the biome that unlocks the piece, so the table fills in as you play.

| Category | Best piece | Comfort | Best unlocks | Opens at |
|----------|------------|:-------:|--------------|----------|
| Fire       | [hearth]* Hearth | 2 | Swamp — needs the stonecutter | Meadows, [fire_pit]* +1 | {biome:swamp}
| Bed        | [piece_bed02]* Dragon Bed | 2 | Mountain — wolf pelts | Meadows, [bed]* +1 | {biome:mountain}
| Seating    | [piece_throne01]* Any throne | 3 | Swamp — iron nails | Black Forest, [piece_chair02]* +2 | {biome:swamp}
| Carpet     | [rug_Bjorn]* Any fur rug | 2 | Black Forest — bear hide | Meadows, [rug_deer]* +1 | {biome:blackforest}
| Table      | [piece_table_round]* Round / Long Heavy Table | 2 | Plains — tar | Black Forest, [piece_table]* +1 | {biome:plains}
| Banner     | [piece_cloth_hanging_door]* Any jute curtain | 2 | Plains — red jute | Black Forest, [piece_banner01]* +1 | {biome:plains}
| Bathing    | [piece_bathtub]* Hot Tub | 2 | Plains — iron and tar | Black Forest, [piece_barber]* +1 | {biome:plains}
| Lantern    | [piece_Lavalantern]* Lava Lantern | 2 | Ashlands — flametal | Mistlands, [piece_dvergr_lantern]* +1 | {biome:ashlands}
| Item stand | [itemstand]* Item Stand | 1 | Black Forest — bronze nails | Black Forest | {biome:blackforest}
| Garland    | [piece_CelebrationGarland]* Flower Garland | 1 | Black Forest — finewood | Black Forest | {biome:blackforest}
| Ornament   | [piece_asksvinskeleton]* Asksvin Skeleton | 1 | Ashlands — carrion parts | Ashlands | {biome:ashlands}

Pieces with **no** category stack instead of competing, and both of them are event-only: [piece_maypole]* Maypole (+1, Midsummer — or found already standing in the Meadows) and [piece_xmastree]* Yule Tree (+1, Yule).

:::warn
**If you remember different numbers, they were the old ones.** Before 1.0 there were seven categories and everything else went into a stacking "Standalone" pile. 1.0 split that pile into Item stand, Ornament, Garland, Lantern and Bathing — five categories that each cap at one piece, and most of them are furniture no comfort guide counted at all.
:::

## Max comfort per biome

Seasonal pieces excluded — these are totals you can go and build on any day of the year.

| Biome | Max | Rested | What it adds |
|-------|:---:|:------:|--------------|
| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | 5 | 12 min | Shelter, [fire_pit]+ [bed]+ [rug_deer]+ | {biome:meadows}
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | 13 | 20 min | [piece_chair02]+ [piece_table]+ [piece_banner01]+ [itemstand]+ [piece_CelebrationGarland]+ [piece_barber]+, and [rug_Bjorn]+ replaces the deer rug | {biome:blackforest}
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | 15 | 22 min | [hearth]+ and [piece_throne01]+ | {biome:swamp}
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | 16 | 23 min | [piece_bed02]+ | {biome:mountain}
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | 19 | 26 min | [piece_bathtub]+ [piece_table_round]+ [piece_cloth_hanging_door]+ | {biome:plains}
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | 20 | 27 min | [piece_dvergr_lantern]+ | {biome:mistlands}
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | 22 | 29 min | [piece_Lavalantern]+ and [piece_asksvinskeleton]+ | {biome:ashlands}
| <img src="/data/vh/BiomeDeepNorth.png" style="width:32px;height:32px;display:block"> Deep North | 22 | 29 min | Nothing new — the ceiling is already met | {biome:deepnorth}

:::biome blackforest
**The Black Forest jump is the big one**, and most of it is furniture nobody counted before 1.0: the [itemstand]* Item Stand, a [piece_CelebrationGarland]* garland and the [piece_barber]* Barber Station are three whole categories that open on finewood and bronze nails. The [rug_Bjorn]* Bearskin Rug needs a bear trophy, so it is the one piece here that can leave you waiting on a drop.
:::

:::biome mistlands
**The Mistlands is no longer a dead biome for comfort.** It used to add nothing at all; the [piece_dvergr_lantern]* Dvergr Wall Lantern now opens the Lantern category for +1, and the [piece_blackmarble_throne]* Black Marble Throne and [rug_hare]* Hare Rug match pieces you already have.
:::

:::biome ashlands
**The full 22** is shelter plus [hearth]* [piece_bed02]* [piece_throne01]* [rug_Bjorn]* [piece_table_round]* [piece_cloth_hanging_door]* [piece_bathtub]* [piece_Lavalantern]* [itemstand]* [piece_CelebrationGarland]* [piece_asksvinskeleton]*.

With both stacking seasonal pieces up the ceiling is **24 comfort = 31 minutes rested** — though [piece_maypole]* Midsummer and [piece_xmastree]* Yule never overlap, so 23 is the most you will hold on any given day.
:::

:::biome deepnorth
**The Deep North adds no comfort.** Its furniture is a full Timberwood set that *matches* the ceiling rather than raising it: [piece_moose_throne]* Antler Throne is +3 like any throne, [piece_table_runed]* Long Carved Table is +2 like the round table, [rug_moose]* Moose Hide Carpet is +2 like any fur rug, and [piece_snowlantern]* Snow Lantern is +2 like the Lava Lantern. Build the hall because you want a room that looks like the north, not for the timer.
:::

## Tips

* **Never leave base unrested.** The buff is worth more than most gear upgrades and it costs you twenty seconds
* Build one comfort room and put the portal hub in it — every category has to be within 10 m of where you actually stand
* Nearby mobs interrupt resting: kill them, or sneak until they lose you
* A [fire_pit]* placed the moment you enter a dungeon both rests you and blocks spawns in that room
* [piece_maypole]* Maypoles spawn naturally in the Meadows; a base built beside one is +1 all year. Otherwise they are craftable at Midsummer (1 June – 6 July)

:::biome swamp
* The [piece_jackoturnip]* Jack-o-turnip is the seasonal piece worth chasing. It is a **+2** Lantern and the Lantern category stays empty for a long while yet, so for most of a playthrough it is two free comfort every Halloween (20 October – 10 November)
:::

:::biome plains
* The [piece_bathtub]* Hot Tub is unique — it grants rested even while wet, which is the one thing that otherwise ends a rest outright
:::

:::biome mistlands
* Once a lantern is up, the Yule pieces are the seasonal ones that do nothing for you: [piece_xmasgarland]* Yule Garland, [piece_xmascrown]* Yule Wreath and [piece_mistletoe]* Mistletoe are all Garlands, and your [piece_CelebrationGarland]* Flower Garland already fills that slot
:::
