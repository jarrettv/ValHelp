# Changelog

Tracks notable changes to ValHelp data, docs, and detail screens.

## 2026-09-26

* **The [bestiary guide](/guides/enemies) now opens with every trophy in the game** — 70 creatures as linked tiles, grouped into bosses, minibosses and biomes, each one blurred until your spoiler level reaches it. A heart marks what you can tame, a peace sign what runs rather than fights.
* **Rare trophy drops have bad-luck protection, and there is a chart for it.** Pick any of the ten rare trophies the most recipes ask for and compare the kill countdown against pure luck. The countdown lives in memory only, so logging out or switching star level throws the progress away — both are called out on the chart.
* **Kall Fimbulbringer is written up**, straight from the game files: three phases, the seven aspects he fights you with instead of his own moveset, and the Jotun Invasion chain you need to summon him at all.
* **Creature filing corrected.** Writhan is a Swamp creature, Dverger belong with the Mistlands, and Skeletons sit under Meadows where they also spawn. Krigen, Hexen, Elaking and Bonemaw are not minibosses; Lord Reto is. Frost Blob is gone, since only a player can spawn one. Lord Reto and Kall Fimbulbringer both got trophy art they never had.
* **Taming** gained the Moose and its Lingonberries, plus a nudge to ferment [MeadTamer]@"Brew of Animal Whispers" before you start, and the Deep North finally has a row in the biome threat table.

## 2026-09-09

* **Valheim 1.0 and the Deep North are on the site.** Everything re-extracted against the 1.0 game files: 917 items, 93 creatures, 20 workstations and 26 station upgrades.
* **The whole Nord tier**, cast from moulds at the [piece_FrostFoundry]@"Frost Foundry" — fifteen [Gold]@"Bloodgold" weapons, each in plain, Frostfire and Thunderblood variants, plus four new staves and the Voidcaller.
* **Three armour sets** — Protector (heavy), Vanguard (medium) and Caller (mage) — with the [CapeDeepNorthMage]@"Cape of the Caller" and [CapeDeepNorth]@"Moose Hide Cape", and two new trinkets.
* **New food**: [Kale]@, [Oat]@"Oats", [Poteitr]@, [Lingonberry]@"Lingonberries", [MooseMeat]@"Moose Meat", [SealBlubber]@"Seal Blubber" and the Northern Morning Fare feast, with the [cauldron_ext7_smoker]@"Smoker" to make them.
* **21 new creatures** in the bestiary under a **Deep North** tag, from the Barka and the Frysling up to **Kall Fimbulbringer**. The Aspects aren't listed separately — they're phases of his fight, not standalone creatures.
* **Deep North on the map**: 18 point-of-interest types in the seed finder, including Mörkhalla, the Northern Village, Winding Tunnels, the Ancestral Memorial and the frozen ships. Worth knowing that **Bear Caves are a Black Forest location** that 1.0 ships inside the Deep North list.
* **Three new station upgrades** on the workstation pages — [cauldron_ext7_smoker]@"Smoker", [blackforge_ext5_apron]@"Smith's Aprons" and [piece_magetable_ext4]@"Standing Loom" — and every upgrade in the game now has its icon, up from 7 of 26. The [artisan_ext1]@"Artisan Press" had the wrong code all along, which is why its card was blank.
* **A serious spoiler leak is fixed.** 483 of 933 items were showing regardless of where you'd set the slider — the Bronze Plate Tunic and the Wolf Fur Cape among them. The cause was 1.0 putting an upgrade idol into nearly every recipe, which made those items unplaceable, and unplaceable meant ungated. The spoiler system now fails the safe way: anything it can't place is hidden rather than shown.
* **Duplicate and misfiled entries cleaned out**: 53 copies of ordinary player gear the Fallen Warrior and the Shadow carry, two summoning staves that were sitting on the armour page, and Krigen listed twice. Kall Fimbulbringer is flagged as a boss like the rest.
* **Item icons are one file now** instead of a thousand. Nothing changes on the page — but a game patch re-compresses Unity's sprite atlas, so re-extracting used to rewrite 527 visually identical images and bury the real additions.
* A **Deep North guide** placeholder and its biome art, so the biome shows up in the spoiler slider, the biome cards and the guide list rather than a fallback snowflake.

## 2026-09-11

* A full **comfort** rebuild against the 1.0 game data — every number on the page and in the guide is re-derived, and most of them went up.
* **Eleven categories, not seven.** 1.0 split the old catch-all "Standalone" pile into **Item stand**, **Ornament**, **Garland**, **Lantern** and **Bathing**. Each one caps at its best piece rather than stacking, and each is now its own category on the comfort page. Only the [piece_maypole]@"Maypole" and [piece_xmastree]@"Yule Tree" are still ungrouped, so they are the only two pieces that stack.
* **Max comfort per biome, recalculated**: Meadows 5, Black Forest **13**, Swamp 15, Mountain 16, Plains **19**, Mistlands **20**, Ashlands **22** — up to **29 minutes rested**. The Mistlands is no longer a dead biome for comfort: [piece_dvergr_lantern]@"Dvergr Wall Lantern" opens the Lantern category there.
* **Black Forest is the big jump.** The item stand, [piece_CelebrationGarland]@"Flower Garland" and [piece_barber]@"Barber Station" all open on finewood and bronze nails, and the [rug_Bjorn]@"Bearskin Rug" is a **+2** carpet — the first category to pass +1 without leaving the second biome.
* **New +2 pieces found**: jute curtains are banners (not decoration), fur rugs are +2 where woven rugs are +1, and [piece_Lavalantern]@"Lava Lantern" is +2 rather than the +1 the page used to show.
* **Deep North** is on the per-biome table, and adds nothing: its Timberwood hall — [piece_moose_throne]@"Antler Throne", [piece_table_runed]@"Long Carved Table", [rug_moose]@"Moose Hide Carpet", [piece_snowlantern]@"Snow Lantern" — matches the ceiling instead of raising it.
* **Every comfort piece has its icon**, 77 of 77. The Deep North furniture, jute curtains, garlands, snow lantern, jack-o-turnip, asksvin skeleton and barber station were all drawing blank.
* **Seasonal pieces are marked from the game itself** rather than a hand-kept list, so each one says which event it belongs to — Midsummer, Halloween or Yule.
* The hearth is filed in the **Swamp** now, not the Meadows: it is only 15 stone, but it needs the stonecutter, and comfort pieces finally carry their crafting station.

## 2026-08-06

* A first draft of the **Black Forest guide**, and a pass over the **Meadows guide** with real in-game screenshots.
* **Black Forest (draft)**: the bronze age in order — [SurtlingCore]@"Surtling Cores" out of burial chambers, [CopperOre]@"copper" and [TinOre]@"tin" into [Bronze]@ — plus fire tactics, the food table, and the three Elder altars. Marked as a draft while screenshots are captured.
* **Places to find**: burial chambers, troll caves, abandoned stone houses and mansions, ore deposits, and the rare rocky circle.
* **Meadows**: in-game screenshots throughout, side-by-side shots of the two houses that hide the [AxeEarly]@"Early Axes" halves, and a tighter first-thirty-minutes checklist.
* **Food and Comfort sections** on both guides — best health and best stamina picks with recipes, and what comfort level to expect for your **Rested** timer.

## 2026-08-05

* A brand new **Meadows guide** — the first full biome walkthrough, from your first thirty minutes to hanging Eikthyr's trophy.
* **Survival first**: a first-thirty-minutes checklist, crafting and workbench mechanics (including why an exposed bench won't craft), how to block, parry, and dodge while the enemies still hit for nothing, and the three-food rule with real Health/Stamina totals.
* **Points of interest**: the Sacrificial Stones, and abandoned houses worth stopping at for beehives, chests, and free lumber.
* **The Early Axes**: the two house layouts that hide the [AxeHead1]@"Curious Axe Head" and [AxeHead2]@"Mysterious Axe Head", and why the [AxeEarly]@"Early Axes" matter — tool tier 2, so they fell birch and oak long before you have any bronze.
* **Eikthyr**: finding his altar, summoning with [TrophyDeer](2), his three attacks, what to bring, and the [PickaxeAntler]@"Antler Pickaxe" waiting on the other side.
* In-game screenshots throughout, with more landing as they're captured.

## 2026-08-01

* The spoiler-free system now covers every item and creature list, with the slider reachable from any page. New creature renders. Map fixes.
* **Spoiler-free guides**: the new Articles guide adds a spoiler slider — set how far you've progressed and everything ahead of you (biome guides, weapon/gear/food/comfort categories, bestiary biomes, and per-biome tables) stays hidden until you reach it. Progress is saved locally and synced to your account when logged in.
* **Every item is biome-tagged**: each weapon, gear piece, food, mead, comfort piece, and creature now knows which biome it belongs to. Anything past your progress stays in the list but is blurred behind a lock showing the biome it's waiting in — so you can see how much is still ahead without being spoiled. Locked entries can't be opened, and they're blurred in the All, Favorites, and Speedrun lists too.
* **Spoiler slider everywhere**: a new eye button in the top bar opens the slider from any page, and on the Articles overview a compact copy follows you down the page once the big slider scrolls out of view.
* **Boss stone renders**: in-game renders of all seven Forsaken boss stones, [TrophyEikthyr]@"Eikthyr" through [TrophyFader]@"Fader", with reworked (Call to Arms) Forsaken power effects.
* **Vegvisir render** added to the Articles overview, with a guide to finding bosses by their red glow.
* **Taming art**: baby-creature renders — piggy, wolf cub, lox calf, and asksvin hatchling — added to the bestiary taming table, with linked foods.
* Map fixes: Ashlands POIs, Dvergr markers, and general map updates.

## 2026-07-24

* Every creature gets an in-game render, and star ratings now match what actually spawns.
* **Bestiary art**: every non-boss creature now has an in-game render on its detail screen, with a **star selector** (0★/1★/2★) that swaps the render and rescales HP — auto-rotating every 2.5s
* Enemy **star ranges are now game-accurate** — each creature shows only the stars it can actually spawn with (Deathsquito, Fallen Valkyrie, Morgen, Stone Golem, Draugr Elite and others never star); [Bestiary_Bat]@"Bat" and [TrophyUlv]@"Ulv" can reach 1★ inside the Howling Cavern
* Added the missing Ashlands mini-boss [LordReto]@"Lord Reto" — always 2★, guards the third Dyrnwyn fragment

## 2026-05-02

* Notes for every remaining weapon class — crossbows, polearms, staves, axes, spears, and all the ammo and bombs.
* Huge update adding notes for crossbows, polearms, staves, arrows, bombs, and tools
* Bows: [BowAshlands]@"Ash Fang", [BowAshlandsBlood]@"Blood Fang", [BowAshlandsRoot]@"Root Fang", [BowAshlandsStorm]@"Storm Fang"
* Crossbows: [CrossbowArbalest]@"Arbalest", [CrossbowRipper]@"Ripper", [CrossbowRipperBlood]@"Wound Ripper", [CrossbowRipperLightning]@"Storm Ripper", [CrossbowRipperNature]@"Root Ripper", [DvergerArbalest]@"Dverger Arbalest"
* Polearms: [AtgeirWood]@"Wooden Atgeir", [AtgeirBronze]@"Bronze Atgeir", [AtgeirIron]@"Iron Atgeir", [AtgeirBlackmetal]@"Black Metal Atgeir", [AtgeirHimminAfl]@"Himminafl"
* Staves: [StaffFireball]@"Staff of Embers", [StaffIceShards]@"Staff of Frost", [StaffShield]@"Staff of Protection", [StaffGreenRoots]@"Staff of the Wild", [StaffLightning]@"Dundr", [StaffClusterbomb]@"Staff of Fracturing", [StaffRedTroll]@"Trollstav", [StaffSkeleton]@"Dead Raiser"
* Wooden trainers: [AxeWood]@"Wooden Axe", [BattleaxeWood]@"Wooden Battleaxe"
* Axes: [AxeBronze]@"Bronze Axe", [AxeBerzerkr]@"Berserkir Axes" (+ [AxeBerzerkrBlood]@"Bleeding", [AxeBerzerkrNature]@"Primal", [AxeBerzerkrLightning]@"Thundering" gem variants)
* Battleaxes: [Battleaxe]@"Battleaxe", [BattleaxeCrystal]@"Crystal", [BattleaxeBlackmetal]@"Black Metal", [BattleaxeSkullSplittur]@"Skull Splittur"
* Wooden trainers: [KnifeWood]@"Wooden Knife", [MaceWood]@"Wooden Mace", [SledgeWood]@"Wooden Sledge", [SpearWood]@"Wooden Spear", [THSwordWood]@"Wooden Greatsword"
* [KnifeButcher]@"Butcher Knife"
* Clubs: [MaceEldner]@"Flametal Mace" + gem variants [MaceEldnerBlood]@"Bloodgeon", [MaceEldnerNature]@"Klossen", [MaceEldnerLightning]@"Storm Star"
* Spears: [SpearChitin]@"Abyssal Harpoon" + Splitnir gem variants [SpearSplitner_Blood]@"Bleeding", [SpearSplitner_Nature]@"Primal", [SpearSplitner_Lightning]@"Storming"
* Swords: Nidhögg gem variants [SwordNiedhoggBlood]@"Bleeding", [SwordNiedhoggNature]@"Primal", [SwordNiedhoggLightning]@"Thundering"
* Added notes for tools: [Hammer]@"Hammer", [Hoe]@"Hoe", [Cultivator]@"Cultivator", [Scythe]@"Scythe", [FishingRod]@"Fishing Rod", [FishingBait]@"Fishing Bait", [Feaster]@"Serving Tray"
* Added notes for every pickaxe: [PickaxeAntler]@"Antler", [PickaxeBronze]@"Bronze", [PickaxeIron]@"Iron", [PickaxeBlackMetal]@"Black Metal"
* Added notes for every arrow: [ArrowWood]@"Wood", [ArrowFlint]@"Flinthead", [ArrowFire]@"Fire", [ArrowBronze]@"Bronzehead", [ArrowIron]@"Ironhead", [ArrowObsidian]@"Obsidian", [ArrowSilver]@"Silver", [ArrowPoison]@"Poison", [ArrowFrost]@"Frost", [ArrowNeedle]@"Needle", [ArrowCarapace]@"Carapace", [ArrowCharred]@"Charred"
* Added notes for every bolt: [BoltBone]@"Bone", [BoltIron]@"Iron", [BoltBlackmetal]@"Black Metal", [BoltCarapace]@"Carapace", [BoltCharred]@"Charred"
* Added notes for every bomb: [BombBile]@"Bile", [BombOoze]@"Ooze", [BombSmoke]@"Smoke", [BombLava]@"Basalt", [BombSiege]@"Explosive Payload", [BombBlob_Frost]@"Frost Blob", [BombBlob_Lava]@"Lava Blob", [BombBlob_Poison]@"Poison Blob", [BombBlob_PoisonElite]@"Elite Poison Blob", [BombBlob_Tar]@"Tar Blob"

## 2026-04-28

* Armor set bonuses documented, and OBS browser sources moved to new secret-code URLs.
* Gear docs: new **Armor Set Bonus Effects** table under Armor (Berserk/Bear, Vilebone Wrath, Endurance/Ask, Fenris Blessing, Ranger/Root, Sneaky/Troll)
* Weapon docs: tier rankings now use clickable item chips ([SpearFlint](1) format) for every weapon listed
* OBS browser sources moved to **`/obs2/<view>/<secret code>`** URLs — generated for you on the [OBS page](/auth/obs). The new URLs work for **both public and private events** you participate in. Old `/obs/<view>/<playerId>` URLs continue to serve public events for backwards compat.

## 2026-04-26

* Notes for every mead and cape in the game, plus food and mead detail screen polish.
* Food detail screen: large fork icon now sits to the left of the stat bars; bar tracks darkened for better contrast
* Mead base detail: shows fermentation result as a hyperlink to the finished mead, with the recipe shown above the effect section and other reordering improvements

* Added mead notes for every single mead in the game:
  * Combat: [MeadBzerker]@"Berserkir Mead", [MeadTasty]@"Tasty Mead"
  * Healing: [MeadHealthMinor]@"Minor Healing", [MeadHealthMedium]@"Medium Healing", [MeadHealthMajor]@"Major Healing", [MeadHealthLingering]@"Lingering Healing"
  * Stamina: [MeadStaminaMinor]@"Minor Stamina", [MeadStaminaMedium]@"Medium Stamina", [MeadStaminaLingering]@"Lingering Stamina"
  * Eitr: [MeadEitrMinor]@"Minor Eitr", [MeadEitrLingering]@"Lingering Eitr"
  * Resistance: [BarleyWine]@"Fire Resistance", [MeadFrostResist]@"Frost Resistance", [MeadPoisonResist]@"Poison Resistance"
  * Movement: [MeadHasty]@"Tonic of Ratatosk", [MeadSwimmer]@"Draught of Vananidir", [MeadLightfoot]@"Lightfoot"
  * Utility: [MeadBugRepellent]@"Anti-Sting", [MeadTamer]@"Animal Whispers", [MeadStrength]@"Troll Endurance", [MeadTrollPheromones]@"Love Potion"
* Added notes for every cape in the game: [CapeDeerHide]@"Deer Hide", [CapeTrollHide]@"Troll Hide", [CapeWolf]@"Wolf Fur", [CapeLinen]@"Linen", [CapeLox]@"Lox", [CapeFeather]@"Feather", [CapeAsksvin]@"Asksvin Cloak", [CapeAsh]@"Ashen", [CapeOdin]@"Cape of Odin"


## 2026-04-25

* Weapon notes across swords, axes, spears, knives, and clubs, with clickable item chips throughout.
* Added weapon notes for many new items across swords, unarmed, axes, spears, knives, and clubs/maces
* Swords: [SwordDyrnwyn]* [Dyrnwyn](/guides/weapons/swords/SwordDyrnwyn), [SwordIron]* [Iron Sword](/guides/weapons/swords/SwordIron), [SwordBlackmetal]* [Black Metal Sword](/guides/weapons/swords/SwordBlackmetal), [SwordNiedhogg]* [Nidhögg](/guides/weapons/swords/SwordNiedhogg), [THSwordKrom]* [Krom](/guides/weapons/swords/THSwordKrom), [THSwordSlayer]* [Slayer](/guides/weapons/swords/THSwordSlayer) and its [THSwordSlayerBlood]* [Brutal](/guides/weapons/swords/THSwordSlayerBlood), [THSwordSlayerNature]* [Primal](/guides/weapons/swords/THSwordSlayerNature), [THSwordSlayerLightning]* [Scourging](/guides/weapons/swords/THSwordSlayerLightning) variants
* Unarmed: [FistFenrirClaw]* [Flesh Rippers](/guides/weapons/unarmed/FistFenrirClaw), [FistBjornUndeadClaw]* [Vilebone Maulclaws](/guides/weapons/unarmed/FistBjornUndeadClaw)
* Axes: [AxeStone]* [Stone Axe](/guides/weapons/axes/AxeStone), [AxeFlint]* [Flint Axe](/guides/weapons/axes/AxeFlint), [AxeIron]* [Iron Axe](/guides/weapons/axes/AxeIron), [AxeBlackMetal]* [Black Metal Axe](/guides/weapons/axes/AxeBlackMetal), [AxeJotunBane]* [Jotun Bane](/guides/weapons/axes/AxeJotunBane)
* Spears: [SpearFlint]* [Flint Spear](/guides/weapons/spears/SpearFlint), [SpearBronze]* [Bronze Spear](/guides/weapons/spears/SpearBronze), [SpearElderbark]* [Ancient Bark Spear](/guides/weapons/spears/SpearElderbark), [SpearWolfFang]* [Fang Spear](/guides/weapons/spears/SpearWolfFang), [SpearCarapace]* [Carapace Spear](/guides/weapons/spears/SpearCarapace), [SpearSplitner]* [Splitnir](/guides/weapons/spears/SpearSplitner)
* Knives: [KnifeFlint]* [Flint Knife](/guides/weapons/knives/KnifeFlint), [KnifeCopper]* [Copper Knife](/guides/weapons/knives/KnifeCopper), [KnifeChitin]* [Abyssal Razor](/guides/weapons/knives/KnifeChitin), [KnifeSilver]* [Silver Knife](/guides/weapons/knives/KnifeSilver), [KnifeBlackMetal]* [Black Metal Knife](/guides/weapons/knives/KnifeBlackMetal), [KnifeSkollAndHati]* [Skoll and Hati](/guides/weapons/knives/KnifeSkollAndHati)
* Clubs and maces: [Club]* [Club](/guides/weapons/clubs/Club), [MaceBronze]* [Bronze Mace](/guides/weapons/clubs/MaceBronze), [MaceIron]* [Iron Mace](/guides/weapons/clubs/MaceIron), [MaceNeedle]* [Porcupine](/guides/weapons/clubs/MaceNeedle), [SledgeIron]* [Iron Sledge](/guides/weapons/clubs/SledgeIron), [SledgeDemolisher]* [Demolisher](/guides/weapons/clubs/SledgeDemolisher)
* Consumables: replaced the fork-color bullet list with a side-by-side icon comparison table
* Macros: documented the `{fork:type:size}` syntax for custom-sized fork icons (use `bal` for balanced)
* Updated default event details to specify `/printseeds` is now allowed for all events

## 2026-04-19

* First weapon notes land, and the event map stops showing unregistered players.
* Event map no longer renders players that aren't registered for the event
* Added weapon notes for [SwordMistwalker]* [Mistwalker](/guides/weapons/swords/SwordMistwalker), [MaceSilver]* [Frostner](/guides/weapons/clubs/MaceSilver), [AxeEarly]* [Early Axes](/guides/weapons/axes/AxeEarly), and more
