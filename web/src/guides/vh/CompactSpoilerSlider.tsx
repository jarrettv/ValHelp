import { useSyncExternalStore } from 'react';
import { biomeIconUrl } from './data';
import { getProgress, setProgress, subscribeSpoiler, SPOILER_BIOMES } from './spoiler';

// A slim, single-row version of the Articles spoiler slider — shares the same
// global progress store, so moving it here updates the whole guide (and the big
// slider) in sync. Meant to sit at the top of the "Mechanics & tips" pages.
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function CompactSpoilerSlider() {
  const n = SPOILER_BIOMES.length;
  const val = useSyncExternalStore(subscribeSpoiler, getProgress, getProgress);
  const current = SPOILER_BIOMES[Math.max(0, Math.floor(val) - 1)]; // furthest revealed

  return (
    <div className="spoiler-mini" title="Spoiler level — drag to reveal more of the guide">
      <EyeIcon />
      <span className="spoiler-mini__label">Spoilers</span>
      <input
        type="range"
        min={1}
        max={n}
        step={0.02}
        value={val}
        onChange={e => setProgress(parseFloat(e.target.value))}
        className="spoiler-mini__range"
        style={{ ['--pct' as string]: `${((val - 1) / (n - 1)) * 100}%` }}
        aria-label="Spoiler level"
      />
      <span className="spoiler-mini__current">
        {current.icon && <img src={biomeIconUrl(current.icon)} alt="" />}
        {current.label}
      </span>
    </div>
  );
}
