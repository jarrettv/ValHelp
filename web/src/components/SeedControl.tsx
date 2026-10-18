import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import './SeedControl.css';

// Seed picker over the world map, styled like the Markers pill. Admins pick
// from their own seeds (or type another); everyone else sees the one public
// seed with a lock, since choosing a seed isn't open yet.

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
const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

interface SeedControlProps {
  seed: string;
  /// Only admins can switch; everyone else gets the locked pill.
  canChange: boolean;
  onChange: (seed: string) => void;
  className?: string;
}

export default function SeedControl({ seed, canChange, onChange, className }: SeedControlProps) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const root = useRef<HTMLDivElement>(null);

  const { data: seeds } = useQuery<WorldListItem[]>({
    queryKey: ['worlds-list'],
    queryFn: () => fetch('/api/worlds/list', { credentials: 'include' }).then(r => (r.ok ? r.json() : [])),
    enabled: canChange && open,
    staleTime: 30_000,
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

  if (!canChange) {
    return (
      <div className={`seed-control ${className ?? ''}`}>
        <div className="seed-control-pill locked" title="Seed selection isn't open yet">
          <GlobeIcon />
          <span className="seed-control-name">{seed}</span>
          <LockIcon />
        </div>
      </div>
    );
  }

  const pick = (s: string) => {
    const t = s.trim();
    if (!t) return;
    setOpen(false);
    setOther('');
    if (t !== seed) onChange(t);
  };

  return (
    <div className={`seed-control ${className ?? ''}`} ref={root}>
      <button className="seed-control-pill" onClick={() => setOpen(o => !o)} aria-expanded={open}
              aria-haspopup="listbox" title="Change seed">
        <GlobeIcon />
        <span className="seed-control-name">{seed}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="seed-control-menu">
          <ul role="listbox" aria-label="Your seeds">
            {(seeds ?? []).map(w => (
              <li key={w.seed}>
                <button role="option" aria-selected={w.seed === seed}
                        className={w.seed === seed ? 'current' : undefined} onClick={() => pick(w.seed)}>
                  <span className="seed-control-name">{w.seed}</span>
                  <span className="seed-control-when">{formatAgo(w.lastViewAt)}</span>
                </button>
              </li>
            ))}
            {seeds && seeds.length === 0 && <li className="seed-control-empty">No seeds yet</li>}
            {!seeds && <li className="seed-control-empty">Loading…</li>}
          </ul>
          <form className="seed-control-other" onSubmit={e => { e.preventDefault(); pick(other); }}>
            <input value={other} onChange={e => setOther(e.target.value)} placeholder="Other seed" maxLength={64}
                   aria-label="Other seed" />
            <button type="submit" disabled={!other.trim()}>Go</button>
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
