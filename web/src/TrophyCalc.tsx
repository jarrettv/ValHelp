import { useEffect, useMemo, useState } from "react";
import trophies from "./domain/trophies";
import { useScorings, ScoringRecord } from "./hooks/useScorings.ts";
import "./TrophyCalc.css";

interface DisplayTrophy {
    code: string;
    name: string;
    score: number;
    dropChance: number | null;
}

const formatDropChance = (value?: number | null) => {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return "100%";
    }
    const percentage = value * 100;
    if (!Number.isFinite(percentage)) {
        return "100%";
    }
    if (percentage >= 10 || Math.abs(percentage - Math.round(percentage)) < 0.01) {
        return `${Math.round(percentage)}%`;
    }
    if (percentage >= 1) {
        return `${parseFloat(percentage.toFixed(1))}%`;
    }
    return `${parseFloat(percentage.toFixed(2))}%`;
};

const TrophyCalc: React.FC = () => {
    const { data, isLoading, isError } = useScorings();
    const scorings: ScoringRecord[] = data?.data ?? [];

    const [activeScoringCode, setActiveScoringCode] = useState<string | null>(null);
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (!scorings.length) {
            setActiveScoringCode(null);
            return;
        }
        if (!activeScoringCode || !scorings.some((s) => s.code === activeScoringCode)) {
            setActiveScoringCode(scorings[0].code);
            setSelectedCodes(new Set());
        }
    }, [scorings, activeScoringCode]);

    useEffect(() => {
        setSelectedCodes(new Set());
    }, [activeScoringCode]);

    const activeScoring = useMemo(() => {
        if (!activeScoringCode) {
            return undefined;
        }
        return scorings.find((s) => s.code === activeScoringCode) ?? undefined;
    }, [scorings, activeScoringCode]);

    const displayTrophies = useMemo(() => {
        if (!activeScoring) {
            return [] as DisplayTrophy[];
        }

        const result: DisplayTrophy[] = trophies
            .filter((trophy) => activeScoring.scores[trophy.code] !== undefined)
            .map((trophy) => ({
                code: trophy.code,
                name: trophy.name,
                score: activeScoring.scores[trophy.code] ?? 0,
                dropChance: activeScoring.rates?.[trophy.code] ?? null,
            }));

        return result;
    }, [activeScoring]);

    const availableCodes = useMemo(() => new Set(displayTrophies.map((t) => t.code)), [displayTrophies]);

    const totalScore = useMemo(() => {
        let sum = 0;
        for (const trophy of displayTrophies) {
            if (selectedCodes.has(trophy.code)) {
                sum += trophy.score ?? 0;
            }
        }
        return sum;
    }, [selectedCodes, displayTrophies]);

    const handleToggle = (code?: string) => {
        if (!code || !availableCodes.has(code)) {
            return;
        }
        setSelectedCodes((prev) => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
            } else {
                next.add(code);
            }
            return next;
        });
    };

    if (isLoading) {
        return (
            <div className="trophy-calc">
                <div className="calc-status">Loading scoring data…</div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="trophy-calc">
                <div className="calc-status error">Unable to load scoring data.</div>
            </div>
        );
    }

    if (!activeScoring || displayTrophies.length === 0) {
        return (
            <div className="trophy-calc">
                <div className="calc-status">No active scoring data found.</div>
            </div>
        );
    }

    return (
        <div className="trophy-calc">
            <div className="calc-toggle-group">
                {scorings.map((scoring) => (
                    <button
                        key={scoring.code}
                        type="button"
                        className={`calc-toggle${activeScoring.code === scoring.code ? " selected" : ""}`}
                        onClick={() => setActiveScoringCode(scoring.code)}
                    >
                        <span>{scoring.name}</span>
                        {scoring.dropRateType ? <small>{scoring.dropRateType}</small> : null}
                    </button>
                ))}
            </div>
            <aside id="score" aria-live="polite">
                {totalScore}
            </aside>
            <div className="calc-trophies">
                {displayTrophies.map((trophy) => {
                    const isSelected = selectedCodes.has(trophy.code);
                    const dropChanceLabel = formatDropChance(trophy.dropChance);
                    const displayName = trophy.name ?? trophy.code;
                    return (
                        <button
                            key={trophy.code}
                            type="button"
                            className={`calc-trophy${isSelected ? " selected" : ""}`}
                            onClick={() => handleToggle(trophy.code)}
                            aria-pressed={isSelected}
                        >
                            <div className="calc-info">
                                <div className="calc-chance">{dropChanceLabel}</div>
                                <div className="calc-score">{trophy.score ?? 0}</div>
                            </div>
                            <img src={`/img/Trophy/${trophy.code}.png`} alt={displayName} loading="lazy" />
                            <div className="calc-name">{displayName}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default TrophyCalc;
