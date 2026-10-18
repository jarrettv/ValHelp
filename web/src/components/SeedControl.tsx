import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicWorlds } from './publicWorlds';
import './SeedControl.css';

// Seed picker over the world map. Everyone can switch between the public
// worlds; the site owner can also open any seed, and pin/unpin public worlds
// and choose the default (the first one) right from the list. The API enforces
// who may open what (api/ModuleWorlds/WorldsPublic.cs).

interface WorldListItem { seed: string; lastViewAt: string }

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const PinIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 15v6" />
  </svg>
);
const StarIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

interface SeedControlProps {
  seed: string;
  /// The site owner: can open any seed and manage the public worlds.
  isOwner: boolean;
  onChange: (seed: string) => void;
  className?: string;
}

export default function SeedControl({ seed, isOwner, onChange, className }: SeedControlProps) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { seeds: publicSeeds } = usePublicWorlds();
  const pub = publicSeeds ?? [];

  const { data: mySeeds } = useQuery<WorldListItem[]>({
    queryKey: ['worlds-list'],
    queryFn: () => fetch('/api/worlds/list', { credentials: 'include' }).then(r => (r.ok ? r.json() : [])),
    enabled: isOwner && open,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (seeds: string[]) => {
      const r = await fetch('/api/admin/worlds/public', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      });
      if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      return (await r.json()).seeds as string[];
    },
    onSuccess: seeds => qc.setQueryData(['public-worlds'], seeds),
  });

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (s: string) => {
    const t = s.trim();
    if (!t) return;
    setOpen(false);
    setOther('');
    if (t !== seed) onChange(t);
  };
  const pin = (s: string) => save.mutate([...pub, s]);
  const unpin = (s: string) => save.mutate(pub.filter(x => x !== s));
  const makeDefault = (s: string) => save.mutate([s, ...pub.filter(x => x !== s)]);

  const others = (mySeeds ?? []).filter(w => !pub.includes(w.seed));
  if (isOwner && !pub.includes(seed) && !others.some(w => w.seed === seed))
    others.unshift({ seed, lastViewAt: new Date().toISOString() });

  return (
    <div className={`seed-control ${className ?? ''}`} ref={root}>
      <button className="seed-control-pill" onClick={() => setOpen(o => !o)} aria-expanded={open}
              aria-haspopup="listbox" title="Change world">
        <GlobeIcon />
        <span className="seed-control-name">{seed}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="seed-control-menu">
          <div className="seed-control-label">Public worlds</div>
          <ul role="listbox" aria-label="Public worlds">
            {pub.map((s, i) => (
              <li key={s} className="seed-control-row">
                <button role="option" aria-selected={s === seed} className={`seed-control-pick${s === seed ? ' current' : ''}`}
                        onClick={() => pick(s)}>
                  <span className="seed-control-name">{s}</span>
                  {i === 0 && <span className="seed-control-badge">default</span>}
                </button>
                {isOwner && (
                  <span className="seed-control-actions">
                    {i > 0 && (
                      <button className="seed-control-icon" title="Make this the default world" onClick={() => makeDefault(s)}
                              disabled={save.isPending}><StarIcon on={false} /></button>
                    )}
                    {pub.length > 1 && (
                      <button className="seed-control-icon on" title="Unpin: hide from the public" onClick={() => unpin(s)}
                              disabled={save.isPending}><PinIcon on /></button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {isOwner && others.length > 0 && (
            <>
              <div className="seed-control-label">Your seeds</div>
              <ul role="listbox" aria-label="Your seeds">
                {others.map(w => (
                  <li key={w.seed} className="seed-control-row">
                    <button role="option" aria-selected={w.seed === seed}
                            className={`seed-control-pick${w.seed === seed ? ' current' : ''}`} onClick={() => pick(w.seed)}>
                      <span className="seed-control-name">{w.seed}</span>
                      <span className="seed-control-when">{formatAgo(w.lastViewAt)}</span>
                    </button>
                    <span className="seed-control-actions">
                      <button className="seed-control-icon" title="Pin: make it a public world" onClick={() => pin(w.seed)}
                              disabled={save.isPending}><PinIcon on={false} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {save.isError && <div className="seed-control-error">{(save.error as Error).message}</div>}

          {/* Any seed: the owner only; everyone else sees it locked. */}
          <form className="seed-control-other" onSubmit={e => { e.preventDefault(); if (isOwner) pick(other); }}>
            <input value={isOwner ? other : ''} onChange={e => setOther(e.target.value)} maxLength={64}
                   readOnly={!isOwner} aria-readonly={!isOwner}
                   placeholder={isOwner ? 'Open any seed…' : 'Other seeds are coming later'} aria-label="Seed" />
            <button type="submit" disabled={!isOwner || !other.trim()}
                    title={isOwner ? 'Open this seed' : 'Only the site owner can open other seeds for now'}>
              {isOwner ? 'Go' : <LockIcon />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function formatAgo(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
