# Spoiler system

Guide content can be **gated by biome**: it stays hidden until the reader drags
the spoiler slider (Articles ▸ overview) far enough into the game. This keeps the
guide "spoiler-free" — you only see what's relevant to your progress.

## How it works (30-second version)

1. One global value, **progress** (0–9), lives in `spoiler.ts` (persisted to
   `localStorage`). The Articles slider writes it. For logged-in users the
   integer level also syncs to their prefs (`GET`/`POST /api/auth/prefs/spoiler`,
   stored as `UserPrefs.Spoiler` — an `int?`), so it follows them across devices.
2. `GuidesLayout` stamps **`data-spoiler="<revealedCount>"`** on its root
   `.vh-guides` element, where `revealedCount = floor(progress)` = how many biomes
   are unlocked.
3. Content is tagged with a class **`sp-b<index>`** (0 = Meadows … 8 = Deep North).
   Plain CSS in `GuidesLayout.css` shows a tagged item only when
   `data-spoiler` is **greater than** its biome index.

Nothing to "turn on" — any content under the Guides section responds automatically.
Dragging the slider is pure CSS (no re-render), so it's instant.

## Biomes (name → index)

Use any of these names when tagging (case-insensitive):

| Index | Names you can write |
|-------|---------------------|
| 0 | `meadows` |
| 1 | `blackforest` · `black forest` · `black-forest` |
| 2 | `ocean` |
| 3 | `swamp` |
| 4 | `mountain` · `mountains` |
| 5 | `plains` |
| 6 | `mistlands` |
| 7 | `ashlands` |
| 8 | `deepnorth` · `deep north` |

An unknown name **fails open** (the content just shows, untagged).

## Marking content in docs

### A block — `:::biome`

Wrap any run of markdown (headings, paragraphs, tables, images) in a fence:

```
:::biome swamp
## Draining the swamp

Bring poison resist mead and a blunt weapon...
:::
```

While locked it shows a **lock bar** — `🔒 Swamp — keep playing to unlock` — and
swaps to the real content once the slider reaches the Swamp.

### A single table row — trailing `{biome:…}`

Add `{biome:NAME}` at the **end of the row**, after the final `|`:

```
| Boss | Power                          |
|------|--------------------------------|
| Eikthyr  | −60% run/jump stamina      | {biome:meadows}
| Bonemass | Blunt/slash/pierce resist  | {biome:swamp}
| Fader    | +100% adrenaline           | {biome:ashlands}
```

Each tagged row is **hidden** until its biome unlocks, then appears in place. The
header row and untagged rows always show. (Rows just hide — no lock bar — so the
table stays clean.) The token is stripped from the output, so it never renders.

See `docs/articles_overview.md` (the boss table) for a live example.

## Choosing a good tag

Tag with the biome where the reader would **first legitimately need** the info —
usually the biome the content is about. Example: Mistlands magic tips →
`{biome:mistlands}` / `:::biome mistlands`.

## Files

| File | Role |
|------|------|
| `spoiler.ts` | biome list, `biomeIndex()`, and the progress store |
| `ArticlesPage.tsx` | the spoiler slider (writes progress) |
| `GuidesLayout.tsx` | stamps `data-spoiler` on `.vh-guides` |
| `GuidesLayout.css` | `.spoiler-block` / `.spoiler-row` styles + reveal rules |
| `vhRender.raw.ts` | parses `:::biome` fences and `{biome:…}` row tags |

## Extending later (items, gear, weapons, food)

The gate is just a class + an ancestor attribute, so any renderer can opt in:
add `sp-b${biomeIndex(item.biome)}` (and `spoiler-row`, or wrap in
`spoiler-block`/`spoiler-body`) to the element. No new plumbing — it responds to
the same slider. When we tag item lists, each row/card gets `sp-b<index>` from the
item's biome and inherits this exact behavior.
