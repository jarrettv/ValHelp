import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CharSnapshot } from '../CharacterTrack';
import './TimelineSlider.css';

// A character's saves along play time (AFK excluded, sessions back to back).
// Each save is a tick; sessions alternate shading; a restored backup is a red
// tick (its play time went back, so the axis holds there). Dragging picks the
// nearest save; arrow keys step one save; play steps through them.

export function formatPlay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

const PLAY_MS = 700;

export default function CharTimeline({ snapshots, index, onChange, worldId, children }: {
  snapshots: CharSnapshot[]; index: number; onChange: (i: number) => void; worldId: number;
  /** Extra controls at the end of the bar. */
  children?: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const n = snapshots.length;
  const min = snapshots[0]?.axis ?? 0;
  const max = snapshots[n - 1]?.axis ?? 0;
  // A single save (or all at one time) still gets a usable track.
  const span = Math.max(1, max - min);
  const pct = (axis: number) => (n < 2 || max === min ? 100 : ((axis - min) / span) * 100);

  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (!playing) return;
    if (indexRef.current >= n - 1) onChange(0);
    const id = setInterval(() => {
      const next = indexRef.current + 1;
      if (next >= n) { setPlaying(false); return; }
      onChange(next);
    }, PLAY_MS);
    return () => clearInterval(id);
  }, [playing, n, onChange]);

  function pick(clientX: number) {
    const el = trackRef.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const axis = min + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span;
    // Nearest save; among saves at the same time (restores) the last one.
    let best = 0;
    for (let i = 0; i < n; i++)
      if (Math.abs(snapshots[i].axis - axis) <= Math.abs(snapshots[best].axis - axis)) best = i;
    onChange(best);
  }

  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    setPlaying(false);
    pick(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => { if (dragging.current) pick(e.clientX); };
  const onUp = () => { dragging.current = false; };
  const onKey = (e: React.KeyboardEvent) => {
    let next = index;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = index - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = index + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    setPlaying(false);
    onChange(Math.max(0, Math.min(n - 1, next)));
  };

  // Session bands.
  const bands: { from: number; to: number; session: number }[] = [];
  for (const s of snapshots) {
    const last = bands[bands.length - 1];
    if (last && last.session === s.session) last.to = s.axis;
    else bands.push({ from: last ? last.to : s.axis, to: s.axis, session: s.session });
  }
  const cur = snapshots[index];

  return (
    <div className="ctl">
      <button className={`tl-play${playing ? ' playing' : ''}`} onClick={() => setPlaying(p => !p)}
        aria-label={playing ? 'Pause' : 'Play'} disabled={n < 2}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="ctl-track" ref={trackRef} role="slider" tabIndex={0}
        aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={index}
        aria-valuetext={cur ? `${formatPlay(cur.axis)} played, session ${cur.session}` : undefined}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}>
        {bands.map((b, i) => (
          <div key={i} className={`ctl-band${b.session % 2 ? ' odd' : ''}`}
            style={{ left: `${pct(b.from)}%`, width: `${Math.max(0.3, pct(b.to) - pct(b.from))}%` }}
            title={`Session ${b.session}`} />
        ))}
        {snapshots.map((s, i) => (
          <div key={s.id} className={`ctl-tick${s.rewind ? ' rewind' : ''}${s.worldId === worldId ? ' here' : ''}${i <= index ? ' past' : ''}`}
            style={{ left: `${pct(s.axis)}%` }} />
        ))}
        {cur && <div className="ctl-thumb" style={{ left: `${pct(cur.axis)}%` }} />}
      </div>
      <div className="ctl-label">
        {cur ? <>{formatPlay(cur.axis)}<small> · save {index + 1}/{n}</small></> : '–'}
      </div>
      {children}
    </div>
  );
}
