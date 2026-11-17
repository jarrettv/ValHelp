import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { iconUrl } from '../guides/vh/data';
import type { BossProgress } from '../obsBosses';

// The run page's boss tracker: eight trophies docked on the right edge, at the
// save on the timeline (api/char/{id}/snapshots/{sid}/bosses). Folds to a small
// tab, remembered per browser; starts folded on phones and for runs with no
// boss progress yet. Hover (or tap) a trophy for its details.

const PREF = 'run-bosses-open';

function readPref(): boolean | null {
  try {
    const v = localStorage.getItem(PREF);
    return v == null ? null : v === '1';
  } catch { return null; }
}

/** One line on where a boss stands, for the tooltip and screen readers. */
function status(b: BossProgress): string {
  if (b.defeated) return 'Defeated';
  const where = b.found ? 'Found' : 'Not found yet';
  const s = b.steps.find(x => !x.done);
  if (!s) return `${where} · ready to summon`;
  const label = s.kind === 'gather' && b.key === 'frozenking' ? 'Jotun invasions' : s.label;
  return `${where} · ${label} ${s.have}/${s.need}`;
}

/** Summon progress 0..1 across the steps (1 when dead). */
function progress(b: BossProgress): number {
  if (b.defeated) return 1;
  return b.steps.reduce((t, s) => t + Math.min(1, s.have / s.need), 0) / b.steps.length;
}

const SwordsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
      <path d="M4 4l11 11M20 4L9 15M13 17l4-4M11 17l-4-4M17.5 17.5l2.5 2.5M6.5 17.5L4 20" />
    </g>
  </svg>
);

export default function RunBosses({ charId, snapId, worldId }: { charId: number; snapId: number; worldId: number }) {
  const q = useQuery<BossProgress[]>({
    queryKey: ['char-bosses', charId, snapId, worldId],
    queryFn: async () => {
      const r = await fetch(`/api/char/${charId}/snapshots/${snapId}/bosses?world=${worldId}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    placeholderData: keepPreviousData,   // no flicker while scrubbing the timeline
    staleTime: 60_000,
  });
  const [pref, setPref] = useState<boolean | null>(readPref);
  const [active, setActive] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // A tap outside closes the tooltip (phones have no hover-out).
  useEffect(() => {
    if (!active) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setActive(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [active]);

  const bosses = q.data;
  if (!bosses) return null;
  const dead = bosses.filter(b => b.defeated).length;
  const started = bosses.some(b => b.found || b.defeated || b.steps.some(s => s.have > 0));
  const open = pref ?? (started && window.matchMedia('(min-width: 641px)').matches);
  const setOpen = (o: boolean) => {
    setPref(o);
    setActive(null);
    try { localStorage.setItem(PREF, o ? '1' : '0'); } catch { /* private mode */ }
  };

  if (!open) {
    return (
      <div className="rb" ref={ref}>
        <button className="rb-tab" onClick={() => setOpen(true)} title="Show bosses" aria-label={`Bosses: ${dead} of ${bosses.length} defeated. Show`}>
          <SwordsIcon /><span>{dead}/{bosses.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rb open" ref={ref}>
      <button className="rb-head" onClick={() => setOpen(false)} title="Hide bosses" aria-label="Hide bosses">
        <span>{dead}/{bosses.length}</span><span className="rb-fold" aria-hidden="true">›</span>
      </button>
      {bosses.map(b => {
        const p = progress(b);
        const text = status(b);
        return (
          <button key={b.key}
            className={`rb-tile${b.found || b.defeated ? ' found' : ''}${b.defeated ? ' dead' : ''}${active === b.key ? ' active' : ''}`}
            aria-label={`${b.name}: ${text}`}
            onPointerEnter={e => { if (e.pointerType === 'mouse') setActive(b.key); }}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(a => a === b.key ? null : a); }}
            onClick={() => setActive(a => a === b.key ? null : b.key)}>
            <img src={iconUrl(b.icon)} alt="" />
            {b.defeated && <span className="rb-check" aria-hidden="true">✓</span>}
            {!b.defeated && p > 0 && <span className="rb-bar" aria-hidden="true"><i style={{ width: `${p * 100}%` }} /></span>}
            {active === b.key && (
              <span className="rb-tip" role="tooltip"><strong>{b.name}</strong><span>{text}</span></span>
            )}
          </button>
        );
      })}
    </div>
  );
}
