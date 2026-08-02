import { useEffect, useRef, useState } from 'react';
import CompactSpoilerSlider from '../guides/vh/CompactSpoilerSlider';

// Eye button in the top bar: drops down the compact spoiler slider so the
// reader can adjust their progress from anywhere, not just the guides pages.
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function SpoilerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="nav-eye" ref={ref}>
      <button
        type="button"
        className={`nav-eye-btn${open ? ' open' : ''}`}
        aria-label="Spoiler level"
        aria-expanded={open}
        title="Spoiler level"
        onClick={() => setOpen(o => !o)}
      >
        <EyeIcon />
      </button>
      {open && (
        <div className="nav-eye-panel" role="dialog" aria-label="Spoiler level">
          <CompactSpoilerSlider />
        </div>
      )}
    </div>
  );
}
