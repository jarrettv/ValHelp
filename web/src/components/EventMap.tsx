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

interface PathPoint { t: number; x: number; z: number; j?: boolean; }

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

interface PortalMarker {
  code: string;       // "Portal" or "Portal:<name>"
  x: number; z: number;
  at: number;
}

interface PlayerMapData {
  index: number;
  id: string;
  name: string;
  avatarUrl: string;
  color: string;
  path: [number, number, number, boolean][];  // [px, py, t, isJump] in map pixels
  currentPos: [number, number] | null;
  trophies: TrophyMarker[];
  penalties: PenaltyMarker[];
  portals: PortalMarker[];
  scoreAtTime: number;
}

// Maximally distinct colors for player paths — high saturation, good visibility on dark maps
const PLAYER_COLORS = [
  '#ff4444', // red
  '#44ddff', // cyan
  '#ffdd00', // yellow
  '#cc44ff', // purple
  '#44ff88', // green
  '#ff8844', // orange
  '#ff44aa', // pink
  '#44aaff', // blue
  '#88ff44', // lime
  '#ffaa44', // amber
  '#44ffdd', // teal
  '#ff4488', // rose
  '#aabbff', // lavender
  '#ddff44', // chartreuse
  '#ff6644', // coral
  '#44ffff', // aqua
  '#dd44ff', // magenta
  '#ffff44', // bright yellow
  '#44ff44', // bright green
  '#ff44ff', // fuchsia
];

// ── Coordinate helpers ───────────────────────────────────────────

// Match ValHelpTools MarkerDataBuilder.WorldToPixel exactly
// Valheim minimap: 2048 texels, 12 world units per texel, half-pixel offset
const TEX_SIZE = 2048;
const PIXEL_SIZE = 12;
const HALF_PIXEL = PIXEL_SIZE / 2;

function worldToPixel(worldX: number, worldZ: number, gs: number): [number, number] {
  const texX = (worldX - HALF_PIXEL) / PIXEL_SIZE + TEX_SIZE / 2;
  const texY = (worldZ - HALF_PIXEL) / PIXEL_SIZE + TEX_SIZE / 2;
  const px = texX / TEX_SIZE * gs;
  const py = (1 - texY / TEX_SIZE) * gs;
  return [px, py];
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
  scoring: Record<string, number>,
): PlayerMapData[] {
  return players.map((player, i) => {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const discordId = player.discordId || String(player.userId);

    // Path from SSE/GET data, filtered by time
    const rawPath = pathData[discordId] || [];
    const filteredPath = maxTime !== null ? rawPath.filter(p => p.t <= maxTime) : rawPath;
    const path = filteredPath.map(p => {
      const [px, py] = worldToPixel(p.x, p.z, gs);
      return [px, py, p.t, !!p.j] as [number, number, number, boolean];
    });
    const currentPos = path.length > 0 ? [path[path.length - 1][0], path[path.length - 1][1]] as [number, number] : null;

    // Find the path time `t` closest to a world position — aligns log events to path timeline.
    // If no path point is within ~200 world units, the trophy/penalty likely arrived before
    // the next path batch — use the latest path `t` as a best estimate.
    const latestT = rawPath.length > 0 ? rawPath[rawPath.length - 1].t : 0;
    const findPathTime = (wx: number, wz: number): number => {
      let bestT = latestT, bestDist = Infinity;
      for (const p of rawPath) {
        const dx = p.x - wx, dz = p.z - wz;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; bestT = p.t; }
      }
      // If nearest point is too far (>200 units), event arrived before its path batch
      if (bestDist > 200 * 200) return latestT;
      return bestT;
    };

    // Collect bonuses by position for this player
    const bonusMap = new Map<string, string>();
    for (const log of player.logs) {
      if (log.code.startsWith('Bonus') && (log.x !== 0 || log.z !== 0)) {
        bonusMap.set(`${log.x},${log.z}`, log.code);
      }
    }

    // Trophies from player logs, timed by nearest path point
    const trophies: TrophyMarker[] = [];
    for (const log of player.logs) {
      if (!log.code.startsWith('Trophy')) continue;
      if (log.x === 0 && log.z === 0) continue;
      const t = findPathTime(log.x, log.z);
      if (maxTime !== null && t > maxTime) continue;
      const bonus = bonusMap.get(`${log.x},${log.z}`) || null;
      trophies.push({ code: log.code, x: log.x, z: log.z, bonus, at: t });
    }

    // Penalties from player logs, timed by nearest path point
    const penalties: PenaltyMarker[] = [];
    for (const log of player.logs) {
      if (!log.code.startsWith('Penalty')) continue;
      if (log.x === 0 && log.z === 0) continue;
      const t = findPathTime(log.x, log.z);
      if (maxTime !== null && t > maxTime) continue;
      penalties.push({ code: log.code, x: log.x, z: log.z, at: t });
    }

    // Portals from player logs
    const portals: PortalMarker[] = [];
    for (const log of player.logs) {
      if (log.code !== 'Portal' && !log.code.startsWith('Portal:')) continue;
      if (log.x === 0 && log.z === 0) continue;
      const t = findPathTime(log.x, log.z);
      if (maxTime !== null && t > maxTime) continue;
      portals.push({ code: log.code, x: log.x, z: log.z, at: t });
    }

    // Compute score at current scrub time (also aligned to path timeline)
    let scoreAtTime = 0;
    for (const log of player.logs) {
      if (log.x === 0 && log.z === 0) {
        // Old format without position — use server timestamp fallback
        const logTimeSec = (new Date(log.at).getTime() - eventStartMs) / 1000;
        if (maxTime !== null && logTimeSec > maxTime) continue;
      } else {
        const t = findPathTime(log.x, log.z);
        if (maxTime !== null && t > maxTime) continue;
      }
      const points = scoring[log.code];
      if (points !== undefined) scoreAtTime += points;
    }

    return { index: i, id: discordId, name: player.name, avatarUrl: player.avatarUrl, color, path, currentPos, trophies, penalties, portals, scoreAtTime };
  });
}

// ── Image cache (avatars + trophy icons) ─────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
let scheduleRedraw: (() => void) | null = null;

function getCachedImage(url: string): HTMLImageElement | null {
  // Rewrite legacy absolute avatar URLs to relative
  if (url.startsWith('https://valheim.help/')) url = url.replace('https://valheim.help', '');
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
  const [mapReady, setMapReady] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [pinnedToLive, setPinnedToLive] = useState(true);
  const [elapsedNow, setElapsedNow] = useState(0);
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<number>>(new Set());
  const hiddenRef = useRef(hiddenPlayers);
  hiddenRef.current = hiddenPlayers;
  const [hidePortals, setHidePortals] = useState(false);
  const hidePortalsRef = useRef(hidePortals);
  hidePortalsRef.current = hidePortals;

  const isLive = event.status === EventStatus.Live;
  const eventStartMs = new Date(event.startAt).getTime();
  const eventEndMs = new Date(event.endAt).getTime();
  const eventDurationSec = Math.max(1, Math.round((eventEndMs - eventStartMs) / 1000));

  // For live events, track elapsed time and auto-advance slider
  useEffect(() => {
    if (!isLive) {
      setElapsedNow(eventDurationSec);
      return;
    }
    const tick = () => {
      const now = Math.round((Date.now() - eventStartMs) / 1000);
      setElapsedNow(now);
      if (pinnedToLive) setScrubTime(null); // null = show everything up to now
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive, eventStartMs, eventDurationSec, pinnedToLive]);

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
      if (hiddenRef.current.has(player.index)) continue;

      // ── Draw path, breaking at jump points (portal/respawn) ──
      if (player.path.length > 1) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.7;
        const SPEED_THRESHOLD = 30; // m/s — well above max Valheim speed

        // Pre-classify each segment as portal or normal
        const isPortalSeg: boolean[] = [false]; // index 0 = no prev segment
        for (let i = 1; i < player.path.length; i++) {
          let isBreak = !!player.path[i][3]; // j flag
          // Always also check speed — j flags are missing on most portal teleports
          if (!isBreak) {
            const dt = player.path[i][2] - player.path[i - 1][2];
            const dpx = player.path[i][0] - player.path[i - 1][0];
            const dpy = player.path[i][1] - player.path[i - 1][1];
            const pixelDist = Math.sqrt(dpx * dpx + dpy * dpy);
            const worldDist = pixelDist * (TEX_SIZE * PIXEL_SIZE) / gs;
            const speed = dt > 0 ? worldDist / dt : (worldDist > 100 ? Infinity : 0);
            isBreak = speed > SPEED_THRESHOLD;
          }
          isPortalSeg.push(isBreak);
        }

        // Draw normal segments (solid)
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        ctx.beginPath();
        const [sx0, sy0] = toScreen(player.path[0][0], player.path[0][1]);
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < player.path.length; i++) {
          const [sx, sy] = toScreen(player.path[i][0], player.path[i][1]);
          if (isPortalSeg[i]) {
            ctx.moveTo(sx, sy);
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.stroke();

        // Draw portal segments (dotted)
        if (!hidePortalsRef.current) {
          ctx.strokeStyle = player.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 4]);
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          for (let i = 1; i < player.path.length; i++) {
            if (!isPortalSeg[i]) continue;
            const [sx0p, sy0p] = toScreen(player.path[i - 1][0], player.path[i - 1][1]);
            const [sx, sy] = toScreen(player.path[i][0], player.path[i][1]);
            ctx.moveTo(sx0p, sy0p);
            ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
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

      // ── Draw portals ──
      if (!hidePortalsRef.current) {
        for (const portal of player.portals) {
          const [ppx, ppy] = worldToPixel(portal.x, portal.z, gs);
          const [sx, sy] = toScreen(ppx, ppy);
          if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;

          const r = Math.max(8, Math.min(14, 10 * scale));
          drawIconCircle(ctx, sx, sy, r, player.color, `/img/Misc/portal_wood.png`);
        }
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

          // Score label above avatar
          const label = String(player.scoreAtTime);
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(label, sx, sy - r - 5);
          ctx.fillStyle = player.color;
          ctx.fillText(label, sx, sy - r - 5);
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
      event.players, stateRef.current.pathData, gs, eventStartMs, scrubTime, event.scoring
    );
    scheduleUpdate();
  }, [event.players, scheduleUpdate, eventStartMs, scrubTime, event.scoring]);

  // Stable ref so SSE handlers always call the latest rebuildMapData without causing reconnects
  const rebuildRef = useRef(rebuildMapData);
  rebuildRef.current = rebuildMapData;

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
        setMapReady(true);
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
    return () => { cancelled = true; window.VectorMap.destroy(); stateRef.current.ready = false; setMapReady(false); };
  }, [event.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load paths: SSE for live events, GET for completed events ──
  // ── Load paths: SSE for live, GET for completed — waits for mapReady ──
  // Uses rebuildRef (stable) so this effect doesn't re-run on every player/scrub change
  useEffect(() => {
    if (!mapReady) return;

    const seed = encodeURIComponent(event.seed);

    if (isLive) {
      const es = new EventSource(`/api/track/map/${seed}/paths`);

      es.addEventListener('init', (e: MessageEvent) => {
        const paths: Record<string, PathPoint[]> = JSON.parse(e.data);
        stateRef.current.pathData = paths;
        rebuildRef.current();
      });

      es.addEventListener('update', (e: MessageEvent) => {
        const { playerId, data } = JSON.parse(e.data);
        const existing = stateRef.current.pathData[playerId] || [];
        stateRef.current.pathData[playerId] = [...existing, ...(data as PathPoint[])];
        rebuildRef.current();
      });

      es.onerror = () => { /* SSE auto-reconnects */ };
      return () => es.close();
    } else {
      let cancelled = false;
      fetch(`/api/track/map/${seed}/paths/all`)
        .then(r => r.ok ? r.json() : null)
        .then(paths => {
          if (cancelled || !paths) return;
          stateRef.current.pathData = paths;
          rebuildRef.current();
        });
      return () => { cancelled = true; };
    }
  }, [event.seed, isLive, mapReady]); // stable deps — no rebuildMapData

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

    // ── Touch pan/zoom ──
    let lastTouchDist = 0;
    let lastTouchMidX = 0;
    let lastTouchMidY = 0;
    let touching = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        e.preventDefault();
        const s = stateRef.current;
        s.dragging = true;
        s.lastMX = e.touches[0].clientX;
        s.lastMY = e.touches[0].clientY;
        area!.classList.add('dragging');
      } else if (e.touches.length === 2) {
        e.preventDefault();
        touching = true;
        stateRef.current.dragging = false;
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        lastTouchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const s = stateRef.current;
      if (e.touches.length === 1 && s.dragging) {
        s.panX += e.touches[0].clientX - s.lastMX;
        s.panY += e.touches[0].clientY - s.lastMY;
        s.lastMX = e.touches[0].clientX;
        s.lastMY = e.touches[0].clientY;
        scheduleUpdate();
      } else if (e.touches.length === 2 && touching) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = area!.getBoundingClientRect();
        const mx = midX - rect.left, my = midY - rect.top;

        // Zoom
        const factor = dist / lastTouchDist;
        const minScale = Math.min(area!.clientWidth / s.imgW, area!.clientHeight / s.imgH) * 0.5;
        const newScale = Math.min(Math.max(s.scale * factor, minScale), 20);
        s.panX = mx - (mx - s.panX) * (newScale / s.scale);
        s.panY = my - (my - s.panY) * (newScale / s.scale);
        s.scale = newScale;

        // Pan with midpoint movement
        s.panX += midX - lastTouchMidX;
        s.panY += midY - lastTouchMidY;

        lastTouchDist = dist;
        lastTouchMidX = midX;
        lastTouchMidY = midY;
        scheduleUpdate();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) touching = false;
      if (e.touches.length === 0) {
        stateRef.current.dragging = false;
        area!.classList.remove('dragging');
      }
    }

    area.addEventListener('wheel', onWheel, { passive: false });
    area.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    area.addEventListener('touchstart', onTouchStart, { passive: false });
    area.addEventListener('touchmove', onTouchMove, { passive: false });
    area.addEventListener('touchend', onTouchEnd);

    return () => {
      area.removeEventListener('wheel', onWheel);
      area.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchmove', onTouchMove);
      area.removeEventListener('touchend', onTouchEnd);
    };
  }, [scheduleUpdate]);

  return (
    <div className="event-map-container">
      <div className="event-map-header">
        {!loading && !error && (
          <>
            <input
              type="range"
              min={0}
              max={isLive ? elapsedNow : eventDurationSec}
              value={scrubTime ?? (isLive ? elapsedNow : eventDurationSec)}
              onChange={(e) => {
                const t = parseInt(e.target.value, 10);
                const maxT = isLive ? elapsedNow : eventDurationSec;
                setScrubTime(t);
                // If dragged to the end during live, re-pin to live
                setPinnedToLive(isLive && t >= maxT - 2);
              }}
            />
            <span className="event-map-scrub-label">
              {formatTime(scrubTime ?? (isLive ? elapsedNow : eventDurationSec))}
              {isLive && pinnedToLive && ' LIVE'}
            </span>
          </>
        )}
        {(loading || error) && <div style={{flex:1}} />}
        <button className="event-map-close" onClick={onClose} title="Close map">&times;</button>
      </div>
      <div className="event-map" ref={mapAreaRef}>
        {loading && <div className="event-map-status">Loading map...</div>}
        {error && <div className="event-map-status error">{error}</div>}
        <canvas ref={glCanvasRef} className="event-map-gl" />
        <canvas ref={markerCanvasRef} className="event-map-markers" />
        <img src="/valheim-logo.webp" alt="Valheim Help" className="event-map-logo" />
      </div>
      {!loading && !error && event.players.length > 0 && (
        <div className="event-map-players">
          {event.players.map((player, i) => {
            const hidden = hiddenPlayers.has(i);
            return (
              <button
                key={player.userId}
                className={`event-map-player-toggle ${hidden ? 'hidden' : ''}`}
                style={{ borderColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                onClick={() => {
                  setHiddenPlayers(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  });
                  scheduleUpdate();
                }}
                title={player.name}
              >
                <img src={player.avatarUrl} alt={player.name} />
              </button>
            );
          })}
          <button
            className={`event-map-portal-toggle ${hidePortals ? 'hidden' : ''}`}
            onClick={() => { setHidePortals(h => !h); scheduleUpdate(); }}
            title={hidePortals ? 'Show portals' : 'Hide portals'}
          >
            <img src="/img/Misc/portal_wood.png" alt="Portals" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EventMap;
