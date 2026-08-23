// ── Biome cheat-sheet cycler ──────────────────────────────────────
// Sits under the spoiler slider on the guides landing page: tap through the
// biomes you have unlocked and watch the same six facts (food, armour, mead,
// weapon, comfort, workstations) climb from one to the next. Content comes
// from biomeSheets.ts via renderBiomeSheet — the identical HTML the
// `{sheet:<biome>}` macro drops into each biome guide.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useVhItems, useVhDefaults, biomeIconUrl } from './data';
import { renderBiomeSheet } from './vhRender.raw';
import { subscribe, getChangeCounter, initVhState } from './vhRender';
import { getRevealedCount, subscribeSpoiler, SPOILER_BIOMES } from './spoiler';
import { BIOME_SHEETS } from './biomeSheets';

const ARROW = (dir: 'prev' | 'next') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
  </svg>
);

export default function BiomeSheetCycler() {
  const { data: items } = useVhItems();
  const { data: defaults } = useVhDefaults();
  const revealed = useSyncExternalStore(subscribeSpoiler, getRevealedCount, getRevealedCount);
  const tick = useSyncExternalStore(subscribe, getChangeCounter);
  const ref = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (items && defaults !== undefined) initVhState(items, defaults);
  }, [items, defaults]);

  // `window.__vhNavigate` (used by links inside the card's notes) is installed
  // by TipsMarkdown, which is always mounted alongside this on the same page.

  // Progression order (spoiler order), limited to what the slider has unlocked.
  const unlocked = useMemo(
    () => SPOILER_BIOMES
      .map((b, i) => ({ ...b, index: i }))
      .filter(b => b.index < revealed && BIOME_SHEETS[b.key]),
    [revealed],
  );

  // Default to where the player actually is; a slider drag back clamps it.
  const active = unlocked.length
    ? unlocked[Math.min(picked ?? unlocked.length - 1, unlocked.length - 1)]
    : null;
  const pos = active ? unlocked.findIndex(b => b.index === active.index) : -1;

  useEffect(() => {
    if (ref.current && active && items) ref.current.innerHTML = renderBiomeSheet(active.key);
  }, [active, items, tick]);

  if (!active) return null;

  return (
    <div className="vh-sheet-cycler">
      <div className="vh-sheet-cycler-bar">
        <button
          className="vh-sheet-cycler-arrow"
          onClick={() => setPicked(Math.max(0, pos - 1))}
          disabled={pos <= 0}
          aria-label="Previous biome"
        >{ARROW('prev')}</button>
        <div className="vh-sheet-cycler-pills">
          {unlocked.map((b, i) => (
            <button
              key={b.key}
              className={`vh-sheet-cycler-pill${b.index === active.index ? ' active' : ''}`}
              onClick={() => setPicked(i)}
              title={b.label}
            >
              {b.icon ? <img src={biomeIconUrl(b.icon)} alt="" /> : null}
              <span>{b.label}</span>
            </button>
          ))}
        </div>
        <button
          className="vh-sheet-cycler-arrow"
          onClick={() => setPicked(Math.min(unlocked.length - 1, pos + 1))}
          disabled={pos >= unlocked.length - 1}
          aria-label="Next biome"
        >{ARROW('next')}</button>
      </div>
      <div className="vh-md" ref={ref} />
    </div>
  );
}
