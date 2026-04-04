import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Event as Ev, EventStatus, Player } from '../domain/event';
import '../lib/vector-map.js';
import './EventMap.css';

declare global {
  interface Window {
    VectorMap: {
      init: (canvas: HTMLCanvasElement, worldName: string, baseUrl?: string) => Promise<void>;
      render: (viewScale: number, panX: number, panY: number, canvasW: number, canvasH: number) => void;
      getGridSize: () => number;
      destroy: () => void;
      ready: boolean;
    };
  }
}

// ── Types ────────────────────────────────────────────────────────

interface PathPoint { t: number; x: number; z: number; }

interface TrophyMarker {
  code: string;       // e.g. "TrophyBoar"
  x: number; z: number;
  bonus: string | null; // "BonusMeadows", "BonusAll", etc.
  at: number;         // seconds since event start
}

interface PenaltyMarker {
  code: string;       // e.g. "PenaltyDeath", "PenaltyLogout", "PenaltySlashDie"
  x: number; z: number;
  at: number;         // seconds since event start
}

interface PlayerMapData {
  id: string;
  name: string;
  avatarUrl: string;
  color: string;
  path: [number, number][];       // [px, py] in map pixels
  currentPos: [number, number] | null;
  trophies: TrophyMarker[];
  penalties: PenaltyMarker[];
}

const PLAYER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8',
  '#00b894', '#e17055', '#74b9ff', '#ffeaa7', '#55efc4',
];

// ── Coordinate helpers ───────────────────────────────────────────

function worldToPixel(worldX: number, worldZ: number, gs: number): [number, number] {
  const scale = gs / (10500 * 2);
  return [worldX * scale + gs / 2, gs / 2 - worldZ * scale];
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

// Build player map data from event data + SSE path data
// maxTime: seconds since event start (null = show everything)
function buildPlayerMapData(
  players: Player[],
  pathData: Record<string, PathPoint[]>,
  gs: number,
  eventStartMs: number,
  maxTime: number | null,
): PlayerMapData[] {
  return players.map((player, i) => {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const discordId = player.discordId || String(player.userId);

    // Path from SSE/GET data, filtered by time
    const rawPath = pathData[discordId] || [];
    const filteredPath = maxTime !== null ? rawPath.filter(p => p.t <= maxTime) : rawPath;
    const path = filteredPath.map(p => worldToPixel(p.x, p.z, gs) as [number, number]);
    const currentPos = path.length > 0 ? path[path.length - 1] : null;

    // Collect bonuses by position for this player
    const bonusMap = new Map<string, string>();
    for (const log of player.logs) {
      if (log.code.startsWith('Bonus') && (log.x !== 0 || log.z !== 0)) {
        bonusMap.set(`${log.x},${log.z}`, log.code);
      }
    }

    // Trophies from player logs, filtered by time
    const trophies: TrophyMarker[] = [];
    for (const log of player.logs) {
      if (!log.code.startsWith('Trophy')) continue;
      if (log.x === 0 && log.z === 0) continue;
      const logTimeSec = (new Date(log.at).getTime() - eventStartMs) / 1000;
      if (maxTime !== null && logTimeSec > maxTime) continue;
      const bonus = bonusMap.get(`${log.x},${log.z}`) || null;
      trophies.push({ code: log.code, x: log.x, z: log.z, bonus, at: logTimeSec });
    }

    // Penalties from player logs, filtered by time
    const penalties: PenaltyMarker[] = [];
    for (const log of player.logs) {
      if (!log.code.startsWith('Penalty')) continue;
      if (log.x === 0 && log.z === 0) continue;
      const logTimeSec = (new Date(log.at).getTime() - eventStartMs) / 1000;
      if (maxTime !== null && logTimeSec > maxTime) continue;
      penalties.push({ code: log.code, x: log.x, z: log.z, at: logTimeSec });
    }

    return { id: discordId, name: player.name, avatarUrl: player.avatarUrl, color, path, currentPos, trophies, penalties };
  });
}

// ── Image cache (avatars + trophy icons) ─────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
let scheduleRedraw: (() => void) | null = null;

function getCachedImage(url: string): HTMLImageElement | null {
  const existing = imageCache.get(url);
  if (existing) return existing;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  img.onload = () => { imageCache.set(url, img); scheduleRedraw?.(); };
  imageCache.set(url, img);
  return img;
}

// ── Drawing helpers ──────────────────────────────────────────────

function drawIconCircle(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, color: string, imgUrl: string) {
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const img = getCachedImage(imgUrl);
  if (img && img.complete && img.naturalWidth > 0) {
    const iconSize = (r - 1.5) * 2;
    ctx.drawImage(img, sx - iconSize / 2, sy - iconSize / 2, iconSize, iconSize);
  }
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, symbol: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.font = `bold ${Math.max(6, r * 1.3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(symbol, x, y);
}

// ── Component ────────────────────────────────────────────────────

interface EventMapProps { event: Ev; onClose: () => void; }

const EventMap: React.FC<EventMapProps> = ({ event, onClose }) => {
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [scrubLabel, setScrubLabel] = useState('');

  const isLive = event.status === EventStatus.Live;
  const eventStartMs = new Date(event.startAt).getTime();
  const eventEndMs = new Date(event.endAt).getTime();
  const eventDurationSec = Math.max(1, Math.round((eventEndMs - eventStartMs) / 1000));

  const stateRef = useRef({
    scale: 1, panX: 0, panY: 0,
    imgW: 0, imgH: 0,
    dragging: false, lastMX: 0, lastMY: 0,
    rafId: 0,
    ready: false,
    pathData: {} as Record<string, PathPoint[]>,
    playerMapData: [] as PlayerMapData[],
  });

  // ── Draw markers ──
  const drawMarkers = useCallback(() => {
    const mc = markerCanvasRef.current;
    const area = mapAreaRef.current;
    if (!mc || !area) return;
    const dpr = window.devicePixelRatio || 1;
    const w = area.clientWidth, h = area.clientHeight;

    if (mc.width !== Math.round(w * dpr) || mc.height !== Math.round(h * dpr)) {
      mc.width = Math.round(w * dpr);
      mc.height = Math.round(h * dpr);
      mc.style.width = w + 'px';
      mc.style.height = h + 'px';
    }

    const ctx = mc.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { scale, panX, panY, imgW, playerMapData } = stateRef.current;
    if (imgW === 0) return;

    const gs = window.VectorMap.getGridSize();
    const mScale = imgW / gs;

    const toScreen = (px: number, py: number): [number, number] => [
      px * mScale * scale + panX,
      py * mScale * scale + panY,
    ];

    for (const player of playerMapData) {
      // ── Draw path as thick line ──
      if (player.path.length > 1) {
        ctx.beginPath();
        const [sx0, sy0] = toScreen(player.path[0][0], player.path[0][1]);
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < player.path.length; i++) {
          const [sx, sy] = toScreen(player.path[i][0], player.path[i][1]);
          ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // ── Draw trophies along the path ──
      for (const trophy of player.trophies) {
        const [tpx, tpy] = worldToPixel(trophy.x, trophy.z, gs);
        const [sx, sy] = toScreen(tpx, tpy);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;

        const r = Math.max(8, Math.min(14, 10 * scale));
        drawIconCircle(ctx, sx, sy, r, player.color, `/img/Trophy/${trophy.code}.png`);

        // Bonus badge on edge of circle
        if (trophy.bonus) {
          const br = Math.max(4, r * 0.4);
          const bx = sx + r * 0.7;
          const by = sy - r * 0.7;
          if (trophy.bonus === 'BonusAll') {
            drawBadge(ctx, bx, by, br, '#00ff88', '*');
          } else if (trophy.bonus.startsWith('BonusTime')) {
            drawBadge(ctx, bx, by, br, '#ffa500', '\u23F3');
          } else {
            drawBadge(ctx, bx, by, br, '#22cc66', '\u2713');
          }
        }
      }

      // ── Draw penalties ──
      for (const penalty of player.penalties) {
        const [ppx, ppy] = worldToPixel(penalty.x, penalty.z, gs);
        const [sx, sy] = toScreen(ppx, ppy);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;

        const r = Math.max(8, Math.min(14, 10 * scale));
        drawIconCircle(ctx, sx, sy, r, player.color, `/img/Penalty/${penalty.code}.webp`);
      }

      // ── Draw avatar at current position ──
      if (player.currentPos) {
        const [sx, sy] = toScreen(player.currentPos[0], player.currentPos[1]);
        if (sx > -40 && sx < w + 40 && sy > -40 && sy < h + 40) {
          const r = Math.max(10, Math.min(18, 14 * scale));

          // Circle background
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#222';
          ctx.fill();
          ctx.strokeStyle = player.color;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Avatar image (clipped to circle)
          const avatar = getCachedImage(player.avatarUrl);
          if (avatar && avatar.complete && avatar.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, r - 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, sx - r + 2, sy - r + 2, (r - 2) * 2, (r - 2) * 2);
            ctx.restore();
          }

          // Player name label
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(player.name, sx, sy - r - 5);
          ctx.fillStyle = player.color;
          ctx.fillText(player.name, sx, sy - r - 5);
        }
      }
    }
  }, []);

  const applyTransform = useCallback(() => {
    const area = mapAreaRef.current;
    if (!area || !stateRef.current.ready) return;
    const { scale, panX, panY } = stateRef.current;
    window.VectorMap.render(scale, panX, panY, area.clientWidth, area.clientHeight);
    drawMarkers();
    stateRef.current.rafId = 0;
  }, [drawMarkers]);

  const scheduleUpdate = useCallback(() => {
    if (!stateRef.current.rafId) {
      stateRef.current.rafId = requestAnimationFrame(applyTransform);
    }
  }, [applyTransform]);

  const fitMap = useCallback(() => {
    const area = mapAreaRef.current;
    const s = stateRef.current;
    if (!area || s.imgW === 0) return;
    const vw = area.clientWidth, vh = area.clientHeight;
    s.scale = Math.min(vw / s.imgW, vh / s.imgH);
    s.panX = (vw - s.imgW * s.scale) / 2;
    s.panY = (vh - s.imgH * s.scale) / 2;
    scheduleUpdate();
  }, [scheduleUpdate]);

  // ── Rebuild player map data when event data or paths change ──
  const rebuildMapData = useCallback(() => {
    if (!stateRef.current.ready) return;
    const gs = window.VectorMap.getGridSize();
    stateRef.current.playerMapData = buildPlayerMapData(
      event.players, stateRef.current.pathData, gs, eventStartMs, scrubTime
    );
    scheduleUpdate();
  }, [event.players, scheduleUpdate, eventStartMs, scrubTime]);

  // ── Load map ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const glCanvas = glCanvasRef.current;
        if (!glCanvas) return;

        const seed = encodeURIComponent(event.seed);
        await window.VectorMap.init(glCanvas, event.seed, `/api/track/map/${seed}`);
        if (cancelled) return;

        const gs = window.VectorMap.getGridSize();
        const s = stateRef.current;
        s.imgW = gs;
        s.imgH = gs;
        s.ready = true;
        scheduleRedraw = scheduleUpdate;

        setLoading(false);
        rebuildMapData();
        fitMap();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Map not available');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; window.VectorMap.destroy(); stateRef.current.ready = false; };
  }, [event.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load paths: SSE for live events, GET for completed events ──
  useEffect(() => {
    if (!stateRef.current.ready) return;

    const seed = encodeURIComponent(event.seed);

    if (isLive) {
      // Live: stream via SSE
      const es = new EventSource(`/api/track/map/${seed}/paths`);

      es.addEventListener('init', (e: MessageEvent) => {
        const paths: Record<string, PathPoint[]> = JSON.parse(e.data);
        stateRef.current.pathData = paths;
        rebuildMapData();
      });

      es.addEventListener('update', (e: MessageEvent) => {
        const { playerId, data } = JSON.parse(e.data);
        const existing = stateRef.current.pathData[playerId] || [];
        stateRef.current.pathData[playerId] = [...existing, ...(data as PathPoint[])];
        rebuildMapData();
      });

      es.onerror = () => { /* SSE auto-reconnects */ };
      return () => es.close();
    } else {
      // Completed: load all paths at once
      let cancelled = false;
      fetch(`/api/track/map/${seed}/paths/all`)
        .then(r => r.ok ? r.json() : null)
        .then(paths => {
          if (cancelled || !paths) return;
          stateRef.current.pathData = paths;
          rebuildMapData();
        });
      return () => { cancelled = true; };
    }
  }, [event.seed, event.status, rebuildMapData]);

  // ── Update trophy markers when event players change ──
  useEffect(() => {
    rebuildMapData();
  }, [event.players, rebuildMapData]);

  // ── Resize ──
  useEffect(() => {
    const onResize = () => { if (stateRef.current.ready) fitMap(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitMap]);

  // ── Pan/zoom ──
  useEffect(() => {
    const area = mapAreaRef.current;
    if (!area) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const s = stateRef.current;
      if (s.imgW === 0) return;
      const rect = area!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const minScale = Math.min(area!.clientWidth / s.imgW, area!.clientHeight / s.imgH) * 0.5;
      const newScale = Math.min(Math.max(s.scale * factor, minScale), 20);
      s.panX = mx - (mx - s.panX) * (newScale / s.scale);
      s.panY = my - (my - s.panY) * (newScale / s.scale);
      s.scale = newScale;
      scheduleUpdate();
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      stateRef.current.dragging = true;
      stateRef.current.lastMX = e.clientX;
      stateRef.current.lastMY = e.clientY;
      area!.classList.add('dragging');
    }

    function onMouseMove(e: MouseEvent) {
      const s = stateRef.current;
      if (!s.dragging) return;
      s.panX += e.clientX - s.lastMX;
      s.panY += e.clientY - s.lastMY;
      s.lastMX = e.clientX;
      s.lastMY = e.clientY;
      scheduleUpdate();
    }

    function onMouseUp() {
      stateRef.current.dragging = false;
      area!.classList.remove('dragging');
    }

    area.addEventListener('wheel', onWheel, { passive: false });
    area.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      area.removeEventListener('wheel', onWheel);
      area.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [scheduleUpdate]);

  return (
    <div className="event-map-container">
      {!isLive && !loading && !error && (
        <div className="event-map-header">
          <input
            type="range"
            min={0}
            max={eventDurationSec}
            value={scrubTime ?? eventDurationSec}
            onChange={(e) => {
              const t = parseInt(e.target.value, 10);
              setScrubTime(t);
              setScrubLabel(formatTime(t));
            }}
          />
          <span className="event-map-scrub-label">{scrubLabel || formatTime(eventDurationSec)}</span>
          <button className="event-map-close" onClick={onClose} title="Close map">&times;</button>
        </div>
      )}
      {(isLive || loading || error) && (
        <div className="event-map-header">
          <div style={{flex:1}} />
          <button className="event-map-close" onClick={onClose} title="Close map">&times;</button>
        </div>
      )}
      <div className="event-map" ref={mapAreaRef}>
        {loading && <div className="event-map-status">Loading map...</div>}
        {error && <div className="event-map-status error">{error}</div>}
        <canvas ref={glCanvasRef} className="event-map-gl" />
        <canvas ref={markerCanvasRef} className="event-map-markers" />
        <img src="/valheim-logo.webp" alt="Valheim Help" className="event-map-logo" />
      </div>
    </div>
  );
};

export default EventMap;
