# Markdown Macros Reference

This guide covers all custom macros available in doc pages. Macros are processed inline and render as styled HTML elements.

## Item Chips

Reference any game item by its code or name. Items render as clickable chips with icons.

### With Quantity

`[ItemCode](amount)` -- shows item chip with quantity badge.

| Syntax           | Result         |
|------------------|----------------|
| `[Wood](10)`     | [Wood](10)     |
| `[Stone](25)`    | [Stone](25)    |
| `[SwordIron](1)` | [SwordIron](1) |

### With Level

`[ItemCode](lvlN)` -- shows item chip with a star and level number.

| Syntax                   | Result                 |
|--------------------------|------------------------|
| `[SwordIron](lvl3)`      | [SwordIron](lvl3)      |
| `[ArmorIronChest](lvl2)` | [ArmorIronChest](lvl2) |

### Icon Only

`[ItemCode]*` -- shows just the item icon (16px), no name or badge.

| Syntax                   | Result                 |
|--------------------------|------------------------|
| `[SwordIron]*`           | [SwordIron]*           |
| `[ShieldBronzeBuckler]*` | [ShieldBronzeBuckler]* |
| `[Club]*`                | [Club]*                |

### Icon 2x

`[ItemCode]+` -- shows the item icon at double size (32px). Good for tables and visual lists.

| Syntax                   | Result                 |
|--------------------------|------------------------|
| `[SwordIron]+`           | [SwordIron]+           |
| `[ShieldBronzeBuckler]+` | [ShieldBronzeBuckler]+ |
| `[Club]+`                | [Club]+                |

### Hyperlink

`[ItemCode]@` -- shows a small icon + name styled as an underlined hyperlink to the item.

| Syntax                   | Result                 |
|--------------------------|------------------------|
| `[SwordIron]@`           | [SwordIron]@           |
| `[Wood]@`                | [Wood]@                |
| `[MeadBzerker]@`         | [MeadBzerker]@         |

`[ItemCode]@"Custom Name"` -- override the display name (still links to the same item).

| Syntax                              | Result                            |
|-------------------------------------|-----------------------------------|
| `[MeadPoisonResist]@"Poison Resist"` | [MeadPoisonResist]@"Poison Resist" |
| `[MeadHasty]@"Ratatosk"`            | [MeadHasty]@"Ratatosk"            |

Item lookup tries: exact code, case-insensitive code, exact display name, then partial name match.

## Recipe Block

`{recipe:ItemCode}` -- renders the full recipe card for a craftable item.

{recipe:SwordIron}

## Forsaken Power

`{power:Boss}` -- renders the boss trophy alongside its Forsaken power, with the effect text in a larger font. Accepts the boss name or the trophy code, so `{power:Eikthyr}` and `{power:TrophyEikthyr}` are the same.

{power:Eikthyr}

{power:The Elder}

Valid keys: `Eikthyr`, `The Elder`, `Bonemass`, `Moder`, `Yagluth`, `The Queen`, `Fader`.

## Biome Cheat Sheet

`{sheet:biome}` -- on a line of its own, renders the compact cheat sheet for a biome: the equipped-armour shot, best three foods with their combined totals, best weapon, meads, and the workstation strip with an icon per upgrade.

Every biome offers a **Light** and a **Heavy** build, and from the Mistlands a third, **Magic**. The tabs in the header swap the armour, food and weapon together -- heavy wants the Health to survive a trade, light wants the Stamina to never be there for it, magic wants Eitr. Meads, comfort, workstations and the boss chain are shared, because they answer the biome rather than your build.

The choice is remembered and applies to every card at once, so cycling biomes on the landing page keeps you on the build you actually play. A biome that has no magic build stays on its own when you pick magic elsewhere.

The header reads as the biome's whole arc -- what you offer at the altar, then the boss, then what you take home. Counts are drawn as one icon per unit rather than a ×N; runs longer than five shingle by a quarter of an icon so they stay on one line:

[TrophyDeer]* [TrophyDeer]* &rarr; [TrophyEikthyr]* Eikthyr &rarr; [HardAntler]* [HardAntler]* [HardAntler]*

Comfort is drawn as a fourth workstation: being sheltered is the base level, and each of the game's eleven furniture categories (fire, bed, carpet, seating, table, banner, item stand, garland, bathing, lantern, ornament) is an upgrade slot that levels up as you go -- campfire becomes a hearth, wood chair becomes a throne. Only the best piece in a category ever counts, so a slot is one pip no matter how much furniture is in the room. The total and the rested duration it buys are derived from those slots, so they always agree with the [Comfort guide](/guides/comfort).

{sheet:meadows}

Valid keys are the biome names/slugs the spoiler system knows: `meadows`, `blackforest`, `ocean`, `swamp`, `mountain`, `plains`, `mistlands`, `ashlands`.

The picks (which foods, which set, which weapon) live in `web/src/guides/vh/biomeSheets.ts` -- one entry per biome. Everything numeric is summed from `items.json` at render time, so armour totals and food stats can't drift from the game data. Two kinds of dimming appear on the card and they mean different things:

* **Grey** -- a whole workstation you can't build yet in this biome. The Meadows card greys the forge and cauldron because you haven't found tin or copper.
* **Blurred** -- past the reader's spoiler level. It sharpens on its own once the slider passes that biome.

The upgrade pips only show what is unlocked *in that biome* -- the Meadows workbench draws two pips, not four. The level-out-of-cap fraction (`3/5`) is what tells you more is coming.

The same card is what the guides landing page cycles through, so editing `biomeSheets.ts` updates both.

Station icons on the card link through to that station's page under [Workstations](/guides/stations), as does the station name on any `{recipe:...}` card.

## Damage Modifier Boxes

`{modbox:Type:Level}` -- colored box indicating a creature's resistance or weakness to a damage type.

### Levels

| Syntax                         | Result                       | Multiplier |
|--------------------------------|------------------------------|:----------:|
| `{modbox:Blunt:Immune}`        | {modbox:Blunt:Immune}        |     0x     |
| `{modbox:Blunt:VeryResistant}` | {modbox:Blunt:VeryResistant} |   0.25x    |
| `{modbox:Blunt:Resistant}`     | {modbox:Blunt:Resistant}     |    0.5x    |
| `{modbox:Blunt:Normal}`        | {modbox:Blunt:Normal}        |     1x     |
| `{modbox:Blunt:Weak}`          | {modbox:Blunt:Weak}          |    1.5x    |
| `{modbox:Blunt:VeryWeak}`      | {modbox:Blunt:VeryWeak}      |     2x     |

### Multiple Types (pipe-separated)

`{modbox:Type1:Level1|Type2:Level2|...}` -- renders a row of modifier boxes.

`{modbox:Blunt:Weak|Slash:Normal|Pierce:Resistant|Fire:Weak}` renders as: {modbox:Blunt:Weak|Slash:Normal|Pierce:Resistant|Fire:Weak}

Valid damage types: Slash, Blunt, Pierce, Fire, Frost, Lightning, Poison, Spirit.

## Progress Bars

### Single Bar

`{bar:percentage:color:label}` -- a labeled progress bar. Label is optional.

| Syntax              | Result            |
|---------------------|-------------------|
| `{bar:75:#c55:HP}`  | {bar:75:#c55:HP}  |
| `{bar:50:#da4}`     | {bar:50:#da4}     |
| `{bar:33:#4c8:Low}` | {bar:33:#4c8:Low} |

### Multiple Bars

`{bars:pct/color/label|pct/color/label|...}` -- compact side-by-side bars. Label is optional.

`{bars:80/#c55/HP|60/#cc6/Stam|40/#6ac/Eitr}` renders as: {bars:80/#c55/HP|60/#cc6/Stam|40/#6ac/Eitr}

## Parry Bonus

`{parry:value}` -- colored multiplier. Green for 2x+, yellow-orange for lower values.

| Syntax        | Result      |
|---------------|-------------|
| `{parry:6}`   | {parry:6}   |
| `{parry:2.5}` | {parry:2.5} |
| `{parry:1.5}` | {parry:1.5} |

## Fork Icons (Food Type)

`{fork:type}` -- colored fork SVG indicating food stat focus. Default size is 14px.

| Syntax       | Result     | Meaning              |
|--------------|------------|----------------------|
| `{fork:hp}`  | {fork:hp}  | HP-focused food      |
| `{fork:sta}` | {fork:sta} | Stamina-focused food |
| `{fork:etr}` | {fork:etr} | Eitr-focused food    |
| `{fork}`     | {fork}     | Balanced food        |

`{fork:type:size}` -- custom pixel size. Use `bal` for balanced when specifying size.

| Syntax           | Result         |
|------------------|----------------|
| `{fork:hp:32}`   | {fork:hp:32}   |
| `{fork:sta:48}`  | {fork:sta:48}  |
| `{fork:bal:48}`  | {fork:bal:48}  |

## Adrenaline Icon

`{adrenaline}` -- inline adrenaline bar icon.

Example: Hit grants {adrenaline} 2 adrenaline per swing.

## Callout Box

Wrap content in a `:::warn` fence to box it in an amber notice. Body lines render normally, so paragraphs, lists, and item chips all work inside.

```
:::warn
⚠ **Draft** — this guide is still being written.
:::
```

## Side-by-Side Images

Wrap two or more `<img>` lines in a `:::row` fence to lay them out side by side. They share the row evenly and stack back to full width on narrow screens.

```
:::row
<img src="/img/guide/meadows/woodhouse6.webp" alt="WoodHouse6 exterior">
<img src="/img/guide/meadows/woodhouse2.webp" alt="WoodHouse2 exterior">
:::
```

Any non-image line inside the fence becomes a **caption above the next image**, and supports the usual inline macros. Caption and image stay together when the row stacks on mobile — use this instead of a table when the data is per-image.

```
:::row
**WoodHouse6** — [AxeHead1]@ in a **55%** chest
<img src="/img/guide/meadows/woodhouse6.webp" alt="WoodHouse6 exterior">
**WoodHouse2** — [AxeHead2]@ in a **25%** chest, then **55%**
<img src="/img/guide/meadows/woodhouse2.webp" alt="WoodHouse2 exterior">
:::
```

Leave the `style` attribute off inside a row — the row stylesheet sizes them. Keep `alt` on every image: it is the accessibility text **and** the shot brief that `scripts/ingest_guide_shots.py --todo` reads.

Rows nest inside a `:::biome` spoiler fence; the closing `:::` shuts the innermost fence first.

## Standard Markdown

These standard markdown features are also supported:

### Text Formatting

* `**bold text**` -- **bold text**
* `` `code` `` -- inline `code` block
* `[link text](/path)` -- internal navigation link

### Damage Type Auto-Coloring

Damage type names are automatically colored when they appear as standalone words:

Slash, Blunt, Pierce, Fire, Frost, Lightning, Poison, Spirit

### Stat Auto-Coloring

Stat names are automatically colored:

HP, Health, Healing, Stamina, Stam, Eitr

### Block Elements

* `# Heading 1`, `## Heading 2`, `### Heading 3`
* `* list item` -- unordered lists
* `| col | col |` -- pipe tables with header separator row
* `<img>` tags pass through for biome icons, etc.
