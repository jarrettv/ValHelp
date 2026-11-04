import { useEffect, useState } from 'react';

// Maximize a full-screen map: hide the site header (body.map-open, index.css)
// so the map fills the window. Remembered per browser for every map page;
// Escape restores. Used by the world map (Worlds) and a run's map (CharacterTrack).

const MAXIMIZED_KEY = 'vh-worlds-maximized';

function readMaximized(): boolean {
  try { return localStorage.getItem(MAXIMIZED_KEY) === '1'; } catch { return false; }
}

export function useMapMaximized(): [boolean, (on?: boolean) => void] {
  const [maximized, setMaximized] = useState(readMaximized);
  useEffect(() => {
    document.body.classList.toggle('map-open', maximized);
    try { localStorage.setItem(MAXIMIZED_KEY, maximized ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!maximized) return () => document.body.classList.remove('map-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('input, textarea, select, .seed-control, .wfb'))) setMaximized(false);
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('map-open'); };
  }, [maximized]);
  return [maximized, (on?: boolean) => setMaximized(m => on ?? !m)];
}

export function MaximizeButton({ maximized, onClick, className = 'worlds-view-max' }: {
  maximized: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button className={className} onClick={onClick} aria-pressed={maximized}
      title={maximized ? 'Restore (show the site menu)' : 'Maximize (hide the site menu)'}
      aria-label={maximized ? 'Restore' : 'Maximize'}>
      {maximized ? <RestoreIcon /> : <MaximizeIcon />}
    </button>
  );
}

const MaximizeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
  </svg>
);
const RestoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" />
  </svg>
);
