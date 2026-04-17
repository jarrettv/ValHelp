import { useRef, useState, useCallback, useEffect } from 'react';
import './TimelineSlider.css';

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  isLive?: boolean;
  pinnedToLive?: boolean;
  formatTime: (s: number) => string;
};

const SPEEDS = [0, 16, 32, 64, 128] as const;

export default function TimelineSlider({ value, min = 0, max, onChange, isLive, pinnedToLive, formatTime }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [speed, setSpeed] = useState<number>(0);
  const range = Math.max(1, max - min);
  const pct = Math.max(0, Math.min(1, (value - min) / range));

  const valueRef = useRef(value);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { maxRef.current = max; }, [max]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (speed <= 0) return;
    const tickMs = 100;
    const id = setInterval(() => {
      const cur = valueRef.current;
      const m = maxRef.current;
      if (cur >= m) { setSpeed(0); return; }
      const next = Math.min(m, cur + speed * (tickMs / 1000));
      onChangeRef.current(Math.round(next));
    }, tickMs);
    return () => clearInterval(id);
  }, [speed]);

  const bumpSpeed = () => {
    setSpeed(s => {
      const idx = SPEEDS.indexOf(s as (typeof SPEEDS)[number]);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  };

  const jumpToClient = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const t = min + (x / rect.width) * range;
    onChange(Math.round(t));
  }, [min, range, onChange]);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    setSpeed(0);
    jumpToClient(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    jumpToClient(e.clientX);
  };
  const endDrag = (e: React.PointerEvent) => {
    setDragging(false);
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? Math.max(60, Math.round(range / 20)) : Math.max(1, Math.round(range / 200));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setSpeed(0); onChange(Math.max(min, value - step)); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setSpeed(0); onChange(Math.min(max, value + step)); e.preventDefault(); }
    else if (e.key === 'Home') { setSpeed(0); onChange(min); e.preventDefault(); }
    else if (e.key === 'End') { setSpeed(0); onChange(max); e.preventDefault(); }
  };

  const hourTicks: number[] = [];
  const halfHourTicks: number[] = [];
  const tenMinTicks: number[] = [];
  for (let t = 600; t < range; t += 600) {
    if (t % 3600 === 0) hourTicks.push(t);
    else if (t % 1800 === 0) halfHourTicks.push(t);
    else tenMinTicks.push(t);
  }

  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setTrackW(entry.contentRect.width);
    });
    ro.observe(el);
    setTrackW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const thumbX = pct * trackW;
  const H = 32;
  const cy = H / 2;

  return (
    <div className="timeline-slider">
      <button
        type="button"
        className={`tl-ff ${speed > 0 ? 'playing' : ''}`}
        onClick={bumpSpeed}
        title={speed > 0 ? `Playing at ${speed}x — click to cycle` : 'Fast-forward playback'}
        aria-label={speed > 0 ? `Playback speed ${speed}x` : 'Start fast-forward'}
      >
        {speed > 0 ? (
          <span className="tl-ff-speed">{speed}<small>x</small></span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5 L13 12 L4 19 Z M13 5 L22 12 L13 19 Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div
        ref={trackRef}
        className={`tl-track ${dragging ? 'dragging' : ''}`}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="Event timeline"
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKey}
      >
        <svg className="tl-svg" width={trackW || 100} height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tl-fill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffe27a" />
              <stop offset="55%" stopColor="#ffb347" />
              <stop offset="100%" stopColor="#ff7043" />
            </linearGradient>
            <linearGradient id="tl-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <radialGradient id="tl-thumb" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#fffceb" />
              <stop offset="60%" stopColor="#ffe27a" />
              <stop offset="100%" stopColor="#ffb347" />
            </radialGradient>
            <filter id="tl-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="tl-fill-clip">
              <rect x="0" y={cy - 7} width={Math.max(0, thumbX)} height="14" rx="7" />
            </clipPath>
          </defs>

          {/* Track base */}
          <rect
            x="0" y={cy - 7}
            width={trackW || 100}
            height="14"
            rx="7"
            fill="rgba(10, 12, 20, 0.55)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />

          {/* Progress fill with shimmer */}
          <g clipPath="url(#tl-fill-clip)">
            <rect x="0" y={cy - 7} width={trackW || 100} height="14" fill="url(#tl-fill)" />
            <rect
              className="tl-shimmer-rect"
              x="0" y={cy - 7}
              width={trackW || 100}
              height="14"
              fill="url(#tl-shimmer)"
              opacity="0.45"
            />
          </g>

          {/* 10-minute ticks (black) */}
          {tenMinTicks.map(t => {
            const x = (t / range) * (trackW || 100);
            return <line key={`t${t}`} x1={x} x2={x} y1={cy - 4} y2={cy + 4} stroke="#000" strokeOpacity="0.75" strokeWidth="1" />;
          })}
          {/* 30-minute ticks (heavy) */}
          {halfHourTicks.map(t => {
            const x = (t / range) * (trackW || 100);
            return <line key={`hh${t}`} x1={x} x2={x} y1={cy - 8} y2={cy + 8} stroke="#000" strokeOpacity="0.9" strokeWidth="2.5" />;
          })}
          {/* Hour ticks */}
          {hourTicks.map(t => {
            const x = (t / range) * (trackW || 100);
            return (
              <g key={`h${t}`}>
                <line x1={x} x2={x} y1={cy - 9} y2={cy + 9} stroke="#000" strokeOpacity="0.85" strokeWidth="2" />
                <text x={x} y={cy - 11} fill="rgba(255,241,162,0.85)" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="system-ui, sans-serif">
                  {Math.round(t / 3600)}h
                </text>
              </g>
            );
          })}

          {/* Thumb */}
          <g transform={`translate(${thumbX}, ${cy})`} filter="url(#tl-glow)">
            <circle r="16" fill="rgba(255,180,70,0.22)" className="tl-thumb-halo" />
            <circle r="11" fill="url(#tl-thumb)" stroke="#2b1d08" strokeWidth="2.5" />
            <line x1="0" y1="-5" x2="0" y2="5" stroke="#2b1d08" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      </div>
      <div className="tl-readout">
        <span className="tl-current">{formatTime(value)}</span>
        <span className="tl-sep">/</span>
        <span className="tl-max">{formatTime(max)}</span>
        {isLive && pinnedToLive && (
          <span className="tl-live"><span className="tl-live-dot" />LIVE</span>
        )}
      </div>
    </div>
  );
}
