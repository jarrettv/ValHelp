# Comfort Mechanics

Comfort increases the duration of your **Rested** buff. The rested buff boosts HP regen, Stamina regen, Eitr regen and XP gain, all critical to growing stronger as you progress.

<span style="font-size:1.25rem">Rested = 7 mins + 1 min per point of comfort</span>

Comfort items are separated in different categories, and items within the same category don't stack. Only the item with the highest comfort of the category is counted. Shelter adds an aditional +2 to comfort. Fire sources need to be lit to provide their comfort bonus.

{comfortcalc}

## Getting the rested bonus

<img src="/data/vh/rested.png" style="float:left;width:48px;height:48px;margin:0 12px 8px 0;image-rendering:pixelated">

While sheltered and near a fire, you temporarily receive the "Resting" status effect. If uninterrupted for 20 seconds, you also gain the "Rested" status effect with a base duration of 7 minutes, +1 minute for each point of comfort.

Resting also needs no hostiles nearby (sneak if necessary), and you can't be wet or burning. Without shelter you have to be sitting for the 20s timer to run; with shelter it counts while you walk around.

### On-the-go

You can place a [fire_pit]* down anywhere dry and sit `X` to rest. You can also place campfires and [piece_logbench01]* sitting logs inside dungeons for resting on the go.

You can get comfort while hanging out with Hildir, Haldor, and the Bog Witch. In the mountain caves, you can rest near the [piece_brazierfloor01]* Standing Brazier.

## Furniture Categories

Only the highest-comfort item in each category counts. Furniture must be within **10 meters** of the player (in 3D — multi-floor designs work).

| Category   | Best Item                | Comfort | Typical Unlocked         |
|------------|--------------------------|:-------:|--------------------------|
| Fire       | [hearth]* Hearth         |    2    | Swamp (stone-cutter)     | {biome:swamp}
| Bed        | [piece_bed02]* Dragon Bed |    2    | Mountain (wolf pelts)    | {biome:mountain}
| Seating    | [piece_throne01]* Any Throne |    3    | Swamp (iron-nails)       | {biome:swamp}
| Table      | [piece_table_round]* Round / Long Heavy Table |    2    | Plains (tar)             | {biome:plains}
| Banner     | [piece_cloth_hanging_door]* Any Jute Curtain |    2    | Mountain (red jute)        | {biome:mountain}
| Carpet     | [rug_Bjorn]* Any Fur Rug |    2    | Black Forest (bear trophy) | {biome:blackforest}
| Bathing    | [piece_bathtub]* Hot Tub |    2    | Plains (iron, tar)       | {biome:plains}
| Lantern    | [piece_Lavalantern]* Lava Lantern |    2    | Ashlands (flametal)      | {biome:ashlands}
| Item stand | [itemstand]* Item Stand  |    1    | Black Forest (bronze nails) | {biome:blackforest}
| Garland    | [piece_CelebrationGarland]* Flower Garland |    1    | Black Forest (finewood)  | {biome:blackforest}
| Ornament   | [piece_asksvinskeleton]* Asksvin Skeleton |    1    | Ashlands (carrion parts) | {biome:ashlands}

Only the [piece_maypole]* Maypole and [piece_xmastree]* Yule Tree have no category — they stack with each other and with everything else.

| Biome | Max | Setup | Rested |
|-------|:---:|-------|:------:|
| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | 5† | [fire_pit]+ + [bed]+ + [rug_deer]+ + Shelter | 12 min | {biome:meadows}
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | 13 | + [piece_chair02]+ + [piece_table]+ + [piece_banner01]+ + [itemstand]+ + [piece_CelebrationGarland]+ + [piece_barber]+ + [rug_Bjorn]+ | 20 min | {biome:blackforest}
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | 15 | + [hearth]+ + [piece_throne01]+ | 22 min | {biome:swamp}
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | 17 | + [piece_bed02]+ + [piece_cloth_hanging_door]+ | 24 min | {biome:mountain}
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | 19 | + [piece_bathtub]+ + [piece_table_round]+ | 26 min | {biome:plains}
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | 20 | + [piece_dvergr_lantern]+ | 27 min | {biome:mistlands}
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | 22 | + [piece_Lavalantern]+ + [piece_asksvinskeleton]+ | 29 min | {biome:ashlands}
| <img src="/data/vh/BiomeDeepNorth.png" style="width:32px;height:32px;display:block"> Deep North | 22 | Comfort already maxed | 29 min | {biome:deepnorth}

†Sitting log is available in Meadows if you find a campsite

With both seasonal items ([piece_maypole]* + [piece_xmastree]*): **max 24 comfort = 31 min rested**.

## Tips

* **Never leave base unrested.** The rested buff boosts HP regen, Stamina regen, Eitr regen, and XP gain — the game is balanced around having it
* Sleeping in a [bed]* skips the 20-second wait and grants rested instantly at your room's comfort level
* Placing a [fire_pit]* immediately when entering a dungeon can prevent mob spawns
* Nearby mobs interrupt resting — kill them or sneak to drop aggro first
* [piece_maypole]* Maypoles spawn naturally in Meadows — consider building your base near one for +1 comfort
* Maypoles can be constructed during Midsummer (1 June - 6 July)
* [piece_xmastree]* Yule Tree can be constructed during Christmas (1 December - 6 January)
* The [piece_bathtub]* Hot Tub is unique — it grants rested even while wet
* [piece_jackoturnip]* Jack-o-turnip is a **+2** Lantern, buildable at Halloween (20 October - 10 November) — free comfort until you reach Mistlands
