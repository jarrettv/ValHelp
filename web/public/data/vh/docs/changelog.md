# Changelog

Tracks notable changes to ValHelp data, docs, and detail screens.

## 2026-05-02

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

* Gear docs: new **Armor Set Bonus Effects** table under Armor (Berserk/Bear, Vilebone Wrath, Endurance/Ask, Fenris Blessing, Ranger/Root, Sneaky/Troll)
* Weapon docs: tier rankings now use clickable item chips ([SpearFlint](1) format) for every weapon listed
* OBS browser sources moved to **`/obs2/<view>/<secret code>`** URLs — generated for you on the [OBS page](/auth/obs). The new URLs work for **both public and private events** you participate in. Old `/obs/<view>/<playerId>` URLs continue to serve public events for backwards compat.

## 2026-04-26

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

* Event map no longer renders players that aren't registered for the event
* Added weapon notes for [SwordMistwalker]* [Mistwalker](/guides/weapons/swords/SwordMistwalker), [MaceSilver]* [Frostner](/guides/weapons/clubs/MaceSilver), [AxeEarly]* [Early Axes](/guides/weapons/axes/AxeEarly), and more
