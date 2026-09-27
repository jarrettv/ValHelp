# Bestiary Details

Per-creature notes that appear on the detail screen after the drops. Each section is keyed to a creature by an HTML comment containing the creature code on the `###` heading.

Format:

    ### Greydwarf <!-- Greydwarf -->
    Notes here. Supports **bold**, *italic*, bullet lists, and tables.

`##` category headers are for author organization — they are not rendered on the detail screen. Only `### Title <!-- Code -->` sections are extracted.

## Meadows

## Black Forest

## Swamp

## Mountains

### Ulv <!-- TrophyUlv -->

Only ever spawns with a star inside the **Howling Cavern** (Hildir's Mountain cave). Ulvs in all other caves are always 0★.

### Bat <!-- Bestiary_Bat -->

Only ever spawns with a star inside the **Howling Cavern** (Hildir's Mountain cave). Bats encountered elsewhere are always 0★.

## Plains

## Mistlands

## Ashlands

## Deep North

### The Void <!-- Bestiary_Ghost_Void -->

**Not obtainable in normal play.** An internal creature left in the game files, listed here only for completeness. It drops no trophy.

It is the only thing that drops the [KnifeVoid]@"Voidcaller", at 100% — and that knife is unobtainable too, since its recipe needs a Voidplasm and nothing in the game drops one.

## Ocean

## Bosses

### Kall Fimbulbringer <!-- Bestiary_FrozenKing -->

The last boss. Three phases, cannot be staggered. Focus on doing blunt/slash damage.

| | |
|---|---|
| Health | 10,000 + 12,800 aspects + 30,000 |
| Summon | 3 × [HatefulBlood]@"Malicious Blood" |
| Drops | [FrozenKingDrop]@"Sacrificial Blood", [CrownJewel]@"Crown Jewel" |
| Forsaken power | **none** — the only boss without one |

**Summoning.** He awaits on the other side of **Aesir Passage** in prison. The bowl takes three [HatefulBlood]@"Malicious Blood", and each requires doing a **Jotun Invasion**, so the last fight in the game is gated on triggering three events.

* Break the **Black Ice** at the bottom of a Mörkhalla dungeon (1,000 HP, no drop) to start an invasion and mark it on the map.
* It lands in Meadows, Black Forest, Swamp, Mountain or Plains, 1,000–12,000 m from world centre, freezing a 100–300 m field around a **Black Ice Core**.
* While the core stands it spawns a wave every 50s within 120m — up to 6 near you, 50 total, [TrophyJotunWarrior]@"Krigen", [TrophyJotunWitch]@"Hexen" and [TrophyElaking]@"Elaking".
* Break the core (1,000 HP) for exactly **one** Malicious Blood. Jotun already spawned stay.
* If you want to farm molds, beware that meteors falling from sky, or enemy attacks can break the ice core.
* Maximum of three can run at once, at least 400 m apart — start all three from Mörkhalla and collect in one trip.

**Attacks.**

| Phase | Attack | Damage | Reach |
|---|---|---|---|
| 1 | Chain slam | 160 blunt, 100 force | 10 m, 40° — double version hits twice |
| 1 | Double sweep | 150 blunt, 130 force | 10 m, 90° — move in, not back |
| 1 | Chain whirl | 150 blunt + 20 frost, 250 force | 8.5 m circle, ~10 s |
| 1 | **Chain rush** | **125 blunt + 125 pierce** | 70° lunge — joint hardest hit |
| 3 | Chain slam | 120 blunt + 50 fire + 50 frost per swing | always double now |
| 3 | Chain whirl | 120 blunt + 50 fire + 50 frost | 8.5 m, ~20 s |
| 3 | Ground punch | 150 blunt | 8.5 m, ~8 s — **full stagger**, breaks guards |
| 3 | **Chain flurry** | **250 blunt** | inside 5 m — joint hardest hit |
| 3 | Spike rain | 100 blunt + 100 frost each, 5 m splash | 20–25 spikes over 30 m, ~25 s |
| 3 | Tendrils | 55 blunt | 9 planted in 15 m, up to 30 alive, ~45 s |

His chains reach **10m** and sweep **90°**, so the ring that looks safe is inside them. He regenerates a full pool per hour — 500 HP a minute on the third phase — so a death and a run back hands a chunk of it straight back. Phase 3 is half elemental, so fire **and** frost resistance both earn a slot; [MeadFrostResist]@"Frost Resistance Mead" does nothing about the fire half. Tendrils are 80 HP each, rooted, weak to fire, immune to poison.

**Phase 2 — the aspects.** He does not attack at all and is immune to everything. He summons previous bosses before him, **12,800 HP** in two chains. Killing one summons its successor, so you choose which line advances.

* Eikthir → The Elder & Bonemass
* The Elder → Moder
* Bonemass → Yagluth
* Moder → Queen
* Yagluth → Fader

| Aspect | Order | HP | Weak to | Resists |
|---|---|:--:|---|---|
| Lightning Stag | opens | 3000 | — | — |
| Writhing Dead | chain 1 | 1600 | Blunt, Frost | Slash, Pierce, Fire, Poison |
| Twisted Soul | chain 1 · 2 | 1700 | — | Pierce, Fire, Poison |
| Emerald Flame | chain 1 · 3 | 1700 | — | Pierce, Fire, Spirit |
| Living Forest | chain 2 | 1600 | Fire | Poison, Spirit |
| Dragon Mother | chain 2 · 2 | 1500 | Fire | Frost, Spirit |
| Crawling Matriarch | chain 2 · 3 | 1700 | — | Pierce, Spirit |

**After.** The [CrownJewel]@"Crown Jewel" plus five [Gold]@"Bloodgold" at a level 4 black forge makes the [HelmetCrownofValheim]@"Crown of Valheim" — 50 armour, +5% movement, −20% attack/run/swim/sneak stamina, and everything that sees you flees. The fear check skips the Boss faction, so Kall and the other seven ignore it entirely.

### Lord Reto <!-- LordReto -->

Lord Reto's four melee attacks, all usable within 1.6m of a player:

**Swing** – Vertical slash, 3m/115° arc, 480 Slash, every 3s.
**Thrust** – Forward stab, 3m line with slight 10° arc, 460 Pierce, every 3s.
**Feint** – Same windup as Swing, but pauses and shifts to a different slash (3m/77.3° arc, 500 Slash), every 8s.
**Thrust feint** – Same windup as Thrust, but pauses then attacks with an upward swing (3m/60° arc, 420 Pierce), every 3s.

Lord Reto can one-shot you even if you have max gear/food.

