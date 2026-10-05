#!/usr/bin/env python3
"""
gen_scorings_sql.py

One-shot generator for api/Migrations/Scorings.sql. Transcribing ~70 trophy
values by hand three times over is how typos get into a scoring table, so the
numbers live here once and the SQL is emitted from them.

Source of truth is TrophyHuntMod's __m_trophyHuntData / __m_biomeBonuses tables
(github.com/smariotti/Valheim, TrophyHuntMod/TrophyHuntMod.cs) as of Valheim
1.0 / Deep North, plus the per-mode penalty constants and score overrides.

Usage:
    python gen_scorings_sql.py
"""

from pathlib import Path
import json

# (code, score, vanilla drop chance)
TROPHIES = [
    # Meadows
    ("TrophyBoar", 10, 0.15),
    ("TrophyDeer", 10, 0.50),
    ("TrophyNeck", 10, 0.05),
    ("TrophyEikthyr", 40, 1.00),
    # Black Forest
    ("TrophyBjorn", 20, 0.10),
    ("TrophyFrostTroll", 20, 0.50),
    ("TrophyGhost", 20, 0.10),
    ("TrophyGreydwarf", 20, 0.05),
    ("TrophyGreydwarfBrute", 20, 0.10),
    ("TrophyGreydwarfShaman", 20, 0.10),
    ("TrophySkeleton", 20, 0.10),
    ("TrophySkeletonPoison", 20, 0.10),
    ("TrophyTheElder", 60, 1.00),
    # Swamp
    ("TrophyAbomination", 20, 0.50),
    ("TrophyBlob", 20, 0.10),
    ("TrophyDraugr", 20, 0.10),
    ("TrophyDraugrElite", 20, 0.10),
    ("TrophyLeech", 20, 0.10),
    ("TrophySurtling", 20, 0.05),
    ("TrophyWraith", 20, 0.05),
    # Writhan is Deep North in TrophyHuntMod; we score it as a Swamp trophy.
    ("TrophyWrithan", 20, 0.10),
    ("TrophyBonemass", 100, 1.00),
    # Mountain
    ("TrophyBlob_Frost", 30, 0.10),  # new in 1.0
    ("TrophyCultist", 30, 0.10),
    ("TrophyFenring", 30, 0.10),
    ("TrophyHatchling", 30, 0.10),
    ("TrophySGolem", 30, 0.05),
    ("TrophyUlv", 30, 0.05),
    ("TrophyWolf", 30, 0.10),
    ("TrophyDragonQueen", 100, 1.00),
    # Plains
    ("TrophyBjornUndead", 30, 0.15),
    ("TrophyDeathsquito", 30, 0.05),
    ("TrophyGoblin", 30, 0.10),
    ("TrophyGoblinBrute", 30, 0.05),
    ("TrophyGoblinShaman", 30, 0.10),
    ("TrophyGrowth", 30, 0.10),
    ("TrophyLox", 30, 0.10),
    ("TrophyGoblinKing", 160, 1.00),
    # Mistlands
    ("TrophyDvergr", 40, 0.05),
    ("TrophyGjall", 40, 0.30),
    ("TrophyHare", 40, 0.05),
    ("TrophySeeker", 40, 0.10),
    ("TrophySeekerBrute", 40, 0.05),
    ("TrophyTick", 40, 0.05),
    ("TrophySeekerQueen", 1000, 1.00),
    # Ashlands
    ("TrophyAsksvin", 50, 0.50),
    ("TrophyBlob_Lava", 50, 0.10),  # new in 1.0
    ("TrophyBonemawSerpent", 50, 0.33),
    ("TrophyCharredArcher", 50, 0.05),
    ("TrophyCharredMage", 50, 0.05),
    ("TrophyCharredMelee", 50, 0.05),
    ("TrophyFallenValkyrie", 50, 0.05),
    ("TrophyMorgen", 50, 0.05),
    ("TrophyVolture", 50, 0.50),
    ("TrophyFader", 1000, 1.00),
    # Deep North -- all new in 1.0
    ("TrophyBarka", 60, 0.10),
    ("TrophyBlob_Morkhalla", 60, 0.10),
    ("TrophyElaking", 60, 0.10),
    ("TrophyJotunWarrior", 60, 0.10),
    ("TrophyJotunWitch", 60, 0.10),
    ("TrophyMole", 60, 0.10),
    ("TrophyMoose", 60, 0.10),
    ("TrophySeal", 60, 0.10),
    # Hildir
    ("TrophySkeletonHildir", 25, 1.00),
    ("TrophyCultist_Hildir", 55, 1.00),
    ("TrophyGoblinBruteBrosBrute", 65, 1.00),
    ("TrophyGoblinBruteBrosShaman", 65, 1.00),
    # Bog Witch
    ("TrophyKvastur", 25, 1.00),
    # Ocean
    ("TrophySerpent", 45, 0.33),
]

# __m_biomeBonuses. Awarded when every trophy in the biome is collected.
BIOME_BONUSES = {
    "BonusMeadows": 20,
    "BonusForest": 40,
    "BonusSwamp": 40,
    "BonusMountains": 60,
    "BonusPlains": 60,
    "BonusMistlands": 80,
    "BonusAshlands": 100,
    "BonusDeepNorth": 120,
}

ALL_BIOME_BONUS = 50  # ALL_BIOME_BONUS_SCORE

# __m_trophyHuntScoreOverrides, TrophyGameMode.TrophySaga
SAGA_OVERRIDES = {"TrophyFader": 400, "TrophySeekerQueen": 400}


def scores_for(mode: str) -> dict:
    """Build the scores dict for one game mode.

    Which bonuses the mod actually emits differs per mode (see the game-mode
    guards around compositeBonusCode in TrophyHuntMod.cs): Hunt gets neither
    biome bonuses nor the all-biomes bonus, Saga gets the all-biomes bonus
    only, Rush gets both.
    """
    scores = {code: value for code, value, _ in TROPHIES}

    if mode == "hunt":
        scores["PenaltyDeath"] = -20
        scores["PenaltyLogout"] = -10
    elif mode == "saga":
        scores.update(SAGA_OVERRIDES)
        scores["PenaltyDeath"] = -30
        scores["PenaltyLogout"] = -10
        scores["BonusAll"] = ALL_BIOME_BONUS
    elif mode == "rush":
        scores["PenaltyDeath"] = -10
        scores["PenaltyLogout"] = -5
        scores["PenaltySlashDie"] = -10
        scores.update(BIOME_BONUSES)
        scores["BonusAll"] = ALL_BIOME_BONUS

    return scores


VANILLA_RATES = {code: rate for code, _, rate in TROPHIES}

RECORDS = [
    ("hunt-dn", "Trophy Hunt Deep North", "TrophyHunt", "Vanilla", VANILLA_RATES, "hunt"),
    ("saga-dn", "Trophy Saga Deep North", "TrophySaga", "100%", {}, "saga"),
    ("rush-dn", "Trophy Rush Deep North", "TrophyRush", "100%", {}, "rush"),
]

SEASONS = [
    ("hunt-dn", "Trophy Hunt Deep North", "Vanilla game and drop rates", "TrophyHunt",
     "Moose seals and jotnar, the frozen north opens up"),
    ("saga-dn", "Trophy Saga Deep North", "Modded with 100% drop rate", "TrophySaga",
     "TODO: add details here"),
    ("rush-dn", "Trophy Rush Deep North", "Very hard and 100% drop rates", "TrophyRush",
     "Moose seals and jotnar, the frozen north opens up"),
]


def jsonb(obj: dict) -> str:
    """Render a dict as a readable multi-line JSON literal for a jsonb column."""
    if not obj:
        return "'{}'"
    body = json.dumps(obj, indent=2)
    return "'" + body.replace("'", "''") + "'"


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    out = root / "api" / "Migrations" / "Scorings.sql"

    lines: list[str] = []
    add = lines.append

    add("-- Scoring records for Valheim 1.0 / Deep North.")
    add("--")
    add("-- Values are transcribed from TrophyHuntMod (smariotti/Valheim) at the 1.0")
    add("-- update: __m_trophyHuntData for trophy scores and vanilla drop rates,")
    add("-- __m_biomeBonuses for the biome bonuses, and the per-mode penalty constants.")
    add("--")
    add("-- Generated by scripts/gen_scorings_sql.py -- edit that, not this file.")
    add("--")
    add("-- Before running, confirm the Bog Witch scoring codes this deactivates:")
    add("--   SELECT code, name, is_active FROM scorings ORDER BY code;")
    add("")

    for code, name, mode, drop_rate_type, rates, mode_key in RECORDS:
        scores = scores_for(mode_key)
        add(f"-- {name}: {len(scores)} entries")
        add("INSERT INTO scorings (code, name, scores, modes, is_active, drop_rate_type, rates)")
        add(f"VALUES ('{code}', '{name}',")
        add(jsonb(scores) + ",")
        add(f"  ARRAY['{mode}'], true, '{drop_rate_type}',")
        add(jsonb(rates))
        add(")")
        add("ON CONFLICT (code) DO UPDATE SET")
        add("  name = EXCLUDED.name,")
        add("  scores = EXCLUDED.scores,")
        add("  modes = EXCLUDED.modes,")
        add("  is_active = EXCLUDED.is_active,")
        add("  drop_rate_type = EXCLUDED.drop_rate_type,")
        add("  rates = EXCLUDED.rates;")
        add("")

    add("-- Seasons to hang Deep North events off, matching the hunt/saga/rush trio")
    add("-- seeded in Seasons.sql.")
    for code, name, pitch, mode, desc in SEASONS:
        add("INSERT INTO seasons (code, name, pitch, mode, \"desc\", hours, owner_id, is_active, "
            "created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)")
        add(f"VALUES ('{code}', '{name}', '{pitch}', '{mode}', '{desc}', 4, 1, true, "
            "'2026-10-05', 'Archy', '2026-10-05', 'Archy', '[]', '{}', '[]', '{}')")
        add("ON CONFLICT (code) DO NOTHING;")
        add("")

    add("-- Retire the Bog Witch scorings. GET /api/scoring filters on is_active, so")
    add("-- this drops them from the trophy calculator and every other scoring picker.")
    add("-- GET /api/scoring/{code} ignores the flag, so historical Bog Witch events")
    add("-- still resolve their own scoring and render correctly.")
    add("UPDATE scorings SET is_active = false WHERE code LIKE '%-bog';")
    add("")

    text = "\n".join(lines)
    # Seasons.sql and the rest of api/Migrations are CRLF; match them.
    out.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))

    for code, name, _, _, _, mode_key in RECORDS:
        print(f"{code:10s} {len(scores_for(mode_key)):3d} entries")
    print(f"wrote {out.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
