# Comfort Mechanics

Comfort items are separated in different categories, and items within the same category (except for Standalone) don't stack. Only the item with the highest comfort of the category is counted. Shelter adds an aditional +2 to comfort. Fire sources need to be lit to provide their comfort bonus.

## Getting the rested bonus

<img src="/data/vh/rested.png" style="float:left;width:48px;height:48px;margin:0 12px 8px 0;image-rendering:pixelated">

While sheltered and near a fire, you temporarily receive the "Resting" status effect. If uninterrupted for 20 seconds, you also gain the "Rested" status effect with a base duration of 7 minutes, +1 minute for each point of comfort.

### On-the-go

You can place a [fire_pit]* down anywhere dry and sit `X` to rest. You can also place campfires and [piece_logbench01]* sitting logs inside dungeons for resting on the go.

You can get comfort while hanging out with Hildir, Haldor, and the Bog Witch. In the mountain caves, you can rest near the [piece_brazierfloor01]* Standing Brazier.

## Furniture Categories

Only the highest-comfort item in each category counts. Furniture must be within **10 meters** of the player (in 3D — multi-floor designs work).

| Category   | Best Item                | Comfort | Typical Unlocked         |
|------------|--------------------------|:-------:|--------------------------|
| Fire       | [hearth]*  Hearth        |    2    | Swamp (stone-cutter)     |
| Bed        | [piece_bed02]* Dragon Bed |    2    | Mountain (wolf pelts)    |
| Seating    | [piece_throne01]* Any Throne |    3    | Swamp (iron-nails)       |
| Table      | [piece_table_round]* Round / Long Heavy Table |    2    | Plains (tar)             |
| Banner     | [piece_banner01]* Any Banner |    1    | Black Forest (finewood)  |
| Carpet     | [rug_deer]* Any Rug      |    1    | Meadows (deer hide)      |
| Standalone | [ArmorStand]* Armour Stand |    1    | Swamp (iron-nails)       |
| Standalone | [piece_bathtub]* Hot Tub |    2    | Plains (iron, tar)       |
| Standalone | [piece_Lavalantern]* Lava Lantern |    1    | Ashlands (flametal)      |
| Standalone | [piece_maypole]* Maypole |    1    | Seasonal / natural spawn |
| Standalone | [piece_xmastree]* Yule Tree |    1    | Seasonal                 |

Standalone items all stack — every other category only counts the best piece.

| Biome | Max | Setup | Rested |
|-------|:---:|-------|:------:|
| <img src="/data/vh/BiomeMeadows.png" style="width:32px;height:32px;display:block"> Meadows | 5† | [fire_pit]+ + [bed]+ + [rug_deer]+ + Shelter | 12 min |
| <img src="/data/vh/BiomeBlackForest.png" style="width:32px;height:32px;display:block"> Black Forest | 9 | + [piece_chair02]+ + [piece_table]+ | 16 min |
| <img src="/data/vh/BiomeSwamp.png" style="width:32px;height:32px;display:block"> Swamp | 12 | + [hearth]+ + [piece_throne01]+ + [ArmorStand]+ | 19 min |
| <img src="/data/vh/BiomeMountains.png" style="width:32px;height:32px;display:block"> Mountain | 13 | + [piece_bed02]+ | 20 min |
| <img src="/data/vh/BiomePlains.png" style="width:32px;height:32px;display:block"> Plains | 16 | + [piece_bathtub]+ + [piece_table_round]+ | 23 min |
| <img src="/data/vh/BiomeMistlands.png" style="width:32px;height:32px;display:block"> Mistlands | 16 | No new comfort items | 23 min |
| <img src="/data/vh/BiomeAshlands.png" style="width:32px;height:32px;display:block"> Ashlands | 17 | + [piece_Lavalantern]+ | 24 min |

†Sitting log is available in Meadows if you find a campsite

With both seasonal items ([piece_maypole]* + [piece_xmastree]*): **max 19 comfort = 26 min rested**.

## Tips

* **Never leave base unrested.** The rested buff boosts HP regen, Stamina regen, Eitr regen, and XP gain — the game is balanced around having it
* Sleeping in a [bed]* skips the 20-second wait and grants rested instantly at your room's comfort level
* Placing a [fire_pit]* immediately when entering a dungeon can prevent mob spawns
* Nearby mobs interrupt resting — kill them or sneak to drop aggro first
* [piece_maypole]* Maypoles spawn naturally in Meadows — consider building your base near one for +1 comfort
* Maypoles can be constructed during Midsummer (1 June - 6 July)
* [piece_xmastree]* Yule Tree can be constructed during Christmas (1 December - 6 January)
* The [piece_bathtub]* Hot Tub is unique — it grants rested even while wet
