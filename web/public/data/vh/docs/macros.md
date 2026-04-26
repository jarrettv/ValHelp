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
