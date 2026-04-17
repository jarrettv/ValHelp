import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Event as Ev, EventStatus, Player } from '../domain/event';
import '../lib/vector-map.js';
import './EventMap.css';
import TimelineSlider from './TimelineSlider';

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

interface PoiMarker {
  type: string;   // "boss", "trader", "start"
  name: string;   // "Eikthyr", "Haldor", "Stones"
  x: number;      // world X
  z: number;      // world Z
}

// POI marker styling — white icons with drop shadow (matches vhcli)
const POI_STYLES: Record<string, { color: string; icon: string }> = {
  boss:     { color: '#ffffff', icon: '/img/Poi/boss.svg' },
  haldor:   { color: '#ffffff', icon: '/img/Poi/haldor.svg' },
  hildir:   { color: '#ffffff', icon: '/img/Poi/hildir.svg' },
  bogwitch: { color: '#ffffff', icon: '/img/Poi/bogwitch.svg' },
  trader:   { color: '#ffffff', icon: '/img/Poi/haldor.svg' },
  start:    { color: '#ffffff', icon: '/img/Poi/start.svg' },
};

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

interface PlayerStateSnapshot {
  t: number;
  hp: number; hpMax: number;
  sp: number; spMax: number;
  foods: string[];
  skills: Record<string, number>;
  equipment: Record<string, string>;
  killDeaths: Record<string, [number, number]>;
}

// Backend sends StatePoint { t, state: PlayerStateSnapshot }
interface StatePoint {
  t: number;
  state: PlayerStateSnapshot;
}

type SidebarMode = 'scores' | 'drops' | 'equip' | 'skills';

interface DataItem {
  code: string;
  name: string;
  type: string;
  image: string;
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

// Item database (loaded lazily from /data.json)
let itemDbPromise: Promise<Map<string, DataItem>> | null = null;
function getItemDb(): Promise<Map<string, DataItem>> {
  if (!itemDbPromise) {
    itemDbPromise = fetch('/data.json')
      .then(r => r.json())
      .then((items: DataItem[]) => {
        const map = new Map<string, DataItem>();
        for (const item of items) map.set(item.code, item);
        return map;
      });
  }
  return itemDbPromise;
}

function findStateAtTime(states: StatePoint[] | undefined, t: number): PlayerStateSnapshot | null {
  if (!states || states.length === 0) return null;
  // Binary search for latest snapshot at or before t
  let lo = 0, hi = states.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (states[mid].t <= t) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best >= 0 ? states[best].state : null;
}

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

const PORTAL_PATH_D = 'M 3.7251132,1.2997237 C 3.6487834,1.2993788 3.5878467,1.3665205 3.5570252,1.5382255 3.6935416,2.0794409 3.5064843,2.8603158 2.7930752,2.5082556 2.4642195,2.532416 1.6725428,1.6287179 1.9182786,2.3571149 2.1943151,3.0031885 2.8093609,3.4461776 2.9598274,4.1489824 3.1863698,4.9376791 2.5518742,5.5552378 2.1917791,6.1788906 1.9947448,6.9996931 1.1031194,6.2960383 0.62588625,6.1052099 -0.05323035,5.5054061 0.42428515,6.6109252 0.60009435,6.8692515 1.1355255,7.8368544 1.614198,8.8541001 1.7628966,9.9618467 2.0191228,10.738285 1.4976514,11.406974 1.363353,12.136266 c 0.1576498,0.05704 0.3270564,0.05828 0.4920154,0.07304 1.4481186,0.303612 2.9357945,0.05368 4.3937374,0.241034 0.6134343,0.168789 1.2509441,0.08898 1.8799639,0.107899 1.249429,0.04672 2.4857923,-0.155623 3.7309623,-0.203041 0.625745,0.204071 0.411098,-0.454825 0.313796,-0.784628 0.03613,-0.731409 -0.327649,-1.6392244 0.203271,-2.2421602 C 12.699088,8.952149 13.960308,9.0229532 13.620723,8.3336484 13.118847,7.8606617 13.658822,7.188852 13.591109,6.6536406 13.054521,6.9404409 12.742487,7.7728663 12.033505,7.6500587 11.557009,7.2701518 11.55652,6.5951267 11.652337,6.0470029 11.301954,5.3787409 11.754566,4.4438972 11.881672,3.8845595 11.740767,3.9896606 10.690226,4.8495968 10.153449,4.4146574 9.4320449,3.7740313 8.6802636,3.1325074 7.7887917,2.7371827 7.0337512,2.5084255 6.2021505,2.7687186 5.4511666,2.8866196 4.8567067,3.3595608 4.13925,2.8142799 4.4290973,2.1234064 4.3215072,1.9091335 3.9540947,1.3007704 3.7251065,1.2997274 Z m 3.9157212,2.6808019 c 0.3994058,0.2293651 0.7274225,0.5512185 1.1603162,0.7368714 0.4722336,0.1782558 0.6609514,0.6012183 0.813223,1.0363856 0.2078138,0.4988248 0.4334974,0.9850482 0.4777874,1.5134913 0.02284,0.4034504 0.08807,0.8046457 0.174535,1.2020393 0.06622,0.4075459 0.03109,0.821591 0.09892,1.2299003 C 10.385286,10.00605 9.9976418,10.65451 9.6638298,10.840038 9.0982954,11.164969 8.8528179,11.047707 8.2323217,11.26483 7.66637,11.432165 7.068875,11.481423 6.4834654,11.565777 5.8780741,11.633632 5.2958792,11.425518 4.7008084,11.362459 3.5583892,10.506797 3.6894833,9.8722794 3.4021433,9.0153006 3.3704957,8.4426488 3.2625237,7.8405531 3.3000271,7.2688359 3.2974196,6.862024 3.5550512,6.4471935 3.8372459,6.1133575 4.2671029,5.4848935 4.6152315,4.9230218 5.174972,4.512805 5.5015039,4.3445405 5.7900633,4.2268343 6.1160231,4.0535633 6.7080715,3.6694585 6.4511261,3.3422791 7.6408344,3.9805256 Z';
let _portalPath: Path2D | null = null;
function getPortalPath(): Path2D {
  if (!_portalPath) _portalPath = new Path2D(PORTAL_PATH_D);
  return _portalPath;
}

function drawPortalMarker(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, color: string) {
  const size = r * 2;
  const scale = size / 14;
  const outsideWidth = 3;
  ctx.save();
  ctx.translate(sx - size / 2, sy - size / 2);
  ctx.scale(scale, scale);
  const path = getPortalPath();
  ctx.lineWidth = (outsideWidth * 2) / scale;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.fillStyle = '#fff';
  ctx.fill(path);
  ctx.restore();
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
  const [hidePois, setHidePois] = useState(false);
  const hidePoisRef = useRef(hidePois);
  hidePoisRef.current = hidePois;
  const poisRef = useRef<PoiMarker[]>([]);
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

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('scores');
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' && window.innerWidth > 768);
  const [itemDb, setItemDb] = useState<Map<string, DataItem> | null>(null);
  const [viewers, setViewers] = useState(0);

  // Load item database eagerly so sidebar tabs have it
  useEffect(() => { getItemDb().then(setItemDb); }, []);

  const stateRef = useRef({
    scale: 1, panX: 0, panY: 0,
    imgW: 0, imgH: 0,
    dragging: false, lastMX: 0, lastMY: 0,
    rafId: 0,
    ready: false,
    pathData: {} as Record<string, PathPoint[]>,
    stateData: {} as Record<string, StatePoint[]>,
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

    // ── Pass 1: draw paths for all players ──
    for (const player of playerMapData) {
      if (hiddenRef.current.has(player.index)) continue;
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
    }

    // ── Pass 2: draw all portal markers (above paths, below player events) ──
    if (!hidePortalsRef.current) {
      for (const player of playerMapData) {
        if (hiddenRef.current.has(player.index)) continue;
        for (const portal of player.portals) {
          const [ppx, ppy] = worldToPixel(portal.x, portal.z, gs);
          const [sx, sy] = toScreen(ppx, ppy);
          if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
          const r = Math.max(8, Math.min(14, 10 * scale));
          drawPortalMarker(ctx, sx, sy, r, player.color);
        }
      }
    }

    // ── Pass 3: draw player events (trophies, penalties, avatars) on top ──
    for (const player of playerMapData) {
      if (hiddenRef.current.has(player.index)) continue;

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

    // ── Draw POI markers on top of everything ──
    if (!hidePoisRef.current) {
      for (const poi of poisRef.current) {
        const [ppx, ppy] = worldToPixel(poi.x, poi.z, gs);
        const [sx, sy] = toScreen(ppx, ppy);
        if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

        const style = POI_STYLES[poi.type] || POI_STYLES.boss;
        const iconSize = Math.max(20, Math.min(35, 27.5 * scale));
        const isStart = poi.type === 'start';
        const sz = isStart ? iconSize * 1.5 : iconSize;

        const icon = getCachedImage(style.icon);
        if (icon && icon.complete && icon.naturalWidth > 0) {
          ctx.save();
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          ctx.drawImage(icon, sx - sz / 2, sy - sz / 2, sz, sz);
          ctx.restore();
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

        // Fetch POIs (non-blocking — map renders fine without them)
        fetch(`/api/track/map/${seed}/pois`)
          .then(r => r.ok ? r.json() : [])
          .then(pois => { poisRef.current = pois; scheduleUpdate(); })
          .catch(() => {});

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
        const payload = JSON.parse(e.data);
        stateRef.current.pathData = payload.paths || {};
        stateRef.current.stateData = payload.states || {};
        if (typeof payload.viewers === 'number') setViewers(payload.viewers);
        rebuildRef.current();
      });

      es.addEventListener('update', (e: MessageEvent) => {
        const { type, playerId, data } = JSON.parse(e.data);
        if (type === 'viewers') {
          setViewers(data as number);
        } else if (type === 'state') {
          const existing = stateRef.current.stateData[playerId] || [];
          stateRef.current.stateData[playerId] = [...existing, ...(data as StatePoint[])];
          rebuildRef.current();
        } else {
          const existing = stateRef.current.pathData[playerId] || [];
          stateRef.current.pathData[playerId] = [...existing, ...(data as PathPoint[])];
          rebuildRef.current();
        }
      });

      es.onerror = () => { /* SSE auto-reconnects */ };
      return () => es.close();
    } else {
      let cancelled = false;
      fetch(`/api/track/map/${seed}/paths/all`)
        .then(r => r.ok ? r.json() : null)
        .then(payload => {
          if (cancelled || !payload) return;
          // Support both old format (flat paths) and new format ({ paths, states })
          if (payload.paths) {
            stateRef.current.pathData = payload.paths;
            stateRef.current.stateData = payload.states || {};
          } else {
            stateRef.current.pathData = payload;
          }
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

  const currentScrub = scrubTime ?? (isLive ? elapsedNow : eventDurationSec);

  // Players not hidden — shown on map and in sidebar
  const visiblePlayers = event.players.filter((_, i) => !hiddenPlayers.has(i));

  return (
    <div className="event-map-container">
      <div className="event-map-header">
        {!loading && !error && (
          <>
            <TimelineSlider
              value={currentScrub}
              min={0}
              max={isLive ? elapsedNow : eventDurationSec}
              onChange={(t) => {
                const maxT = isLive ? elapsedNow : eventDurationSec;
                setScrubTime(t);
                setPinnedToLive(isLive && t >= maxT - 2);
              }}
              formatTime={formatTime}
            />
            <button
              className={`header-toggle-btn ${hidePortals ? 'off' : ''}`}
              onClick={() => { setHidePortals(h => !h); scheduleUpdate(); }}
              title={hidePortals ? 'Show portals' : 'Hide portals'}
            >
              <img src="/img/Misc/portal.svg" alt="Portals" />
            </button>
            <button
              className={`header-toggle-btn ${hidePois ? 'off' : ''}`}
              onClick={() => { setHidePois(h => !h); scheduleUpdate(); }}
              title={hidePois ? 'Show POIs' : 'Hide POIs'}
            >
              <img src="/img/Poi/boss.svg" alt="POIs" />
            </button>
          </>
        )}
        {(loading || error) && <div style={{flex:1}} />}
        <button className="event-map-close" onClick={onClose} title="Close map">&times;</button>
      </div>
      <div className="event-map-body">
        <div className="event-map" ref={mapAreaRef}>
          {loading && <div className="event-map-status">Loading map...</div>}
          {error && <div className="event-map-status error">{error}</div>}
          <canvas ref={glCanvasRef} className="event-map-gl" />
          <canvas ref={markerCanvasRef} className="event-map-markers" />
          {!loading && !error && (
            isLive ? (
              <div className="event-map-status-badge live">
                <span className="event-map-status-dot" />
                LIVE
              </div>
            ) : (
              <div className="event-map-status-badge final">
                <svg className="event-map-status-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" />
                </svg>
                FINAL
              </div>
            )
          )}
          {isLive && viewers > 0 && (
            <div className="event-map-viewers">
              <span className="event-map-viewers-dot" />
              {viewers} {viewers === 1 ? 'person is' : 'people are'} here
            </div>
          )}
          <img src="/valheim-logo.webp" alt="Valheim Help" className="event-map-logo" onClick={onClose} />
        </div>
        {!loading && !error && event.players.length > 0 && (
          <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-avatars">
              {event.players.map((player, i) => {
                const isHidden = hiddenPlayers.has(i);
                return (
                  <button
                    key={player.userId}
                    className={`sidebar-avatar ${isHidden ? 'off' : ''}`}
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
              <div style={{ flex: 1 }} />
              <button
                className="sidebar-expand-btn"
                onClick={() => setSidebarOpen(o => !o)}
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarOpen ? '\u25B6' : '\u25C0'}
              </button>
            </div>
            {sidebarOpen && (
              <div className="sidebar-content">
                <div className="sidebar-tabs">
                  {(['scores', 'drops', 'equip', 'skills'] as SidebarMode[]).map(mode => (
                    <button
                      key={mode}
                      className={sidebarMode === mode ? 'active' : ''}
                      onClick={() => setSidebarMode(mode)}
                    >
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="sidebar-body">
                  {sidebarMode === 'scores' ? (
                    <SidebarScores
                      players={visiblePlayers}
                      allPlayers={event.players}
                      scoring={event.scoring}
                      scrubTime={currentScrub}
                      eventStartMs={eventStartMs}
                      itemDb={itemDb}
                    />
                  ) : sidebarMode === 'drops' ? (
                    <SbDrops
                      players={visiblePlayers}
                      allPlayers={event.players}
                      stateData={stateRef.current.stateData}
                      scrubTime={currentScrub}
                    />
                  ) : sidebarMode === 'skills' ? (
                    <SbSkills
                      players={visiblePlayers}
                      allPlayers={event.players}
                      stateData={stateRef.current.stateData}
                      scrubTime={currentScrub}
                    />
                  ) : (
                    <SbEquip
                      players={visiblePlayers}
                      allPlayers={event.players}
                      stateData={stateRef.current.stateData}
                      scrubTime={currentScrub}
                      itemDb={itemDb}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sidebar Components ──────────────────────────────────────────

const EQUIP_SLOTS: Record<string, string> = { H: 'Helmet', C: 'Chest', G: 'Legs', S: 'Cape', U: 'Belt', T: 'Trinket' };
const SKILL_ORDER = [
  'Swords','Knives','Clubs','Polearms','Spears','Axes','Bows','Crossbows',
  'ElementalMagic','BloodMagic','Unarmed','Pickaxes','WoodCutting',
  'Blocking','Dodge','Run','Jump','Sneak','Swim','Ride','Fishing','Cooking','Farming','Crafting'
];

const getPlayerId = (p: Player) => p.discordId || String(p.userId);

// ── Scores tab: trophy checklist / leaderboard ──

const SidebarScores: React.FC<{
  players: Player[];
  allPlayers: Player[];
  scoring: Record<string, number>;
  scrubTime: number;
  eventStartMs: number;
  itemDb: Map<string, DataItem> | null;
}> = ({ players, allPlayers, scoring, scrubTime, eventStartMs }) => {
  const scored = players.map(p => {
    const idx = allPlayers.indexOf(p);
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    // Filter logs by scrub time, compute score
    const logs = p.logs
      .filter(l => {
        const timeSec = (new Date(l.at).getTime() - eventStartMs) / 1000;
        return timeSec <= scrubTime;
      })
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let score = 0;
    for (const l of logs) {
      const pts = scoring[l.code];
      if (pts !== undefined) score += pts;
    }
    return { player: p, index: idx, color, score, logs };
  }).sort((a, b) => b.score - a.score);

  if (players.length === 0) return <div className="sb-empty">No players visible</div>;

  return (
    <div className="sb-scores">
      {scored.map(({ player, color, score, logs }) => (
        <div key={player.userId} className="sb-score-player">
          <div className="sb-score-big" style={{ color }}>{score}</div>
          <div className="sb-score-icons">
            {logs.map((log, i) =>
              log.code.startsWith('Trophy') ? (
                <img key={i} src={`/img/Trophy/${log.code}.png`} alt="" className="sb-score-icon" style={{ outlineColor: color }} />
              ) : log.code.startsWith('Penalty') ? (
                <img key={i} src={`/img/Penalty/${log.code}.webp`} alt="" className="sb-score-icon penalty" style={{ outlineColor: color }} />
              ) : log.code.startsWith('Bonus') ? (
                <img key={i} src={`/img/Bonus/${log.code}.round.png`} alt="" className="sb-score-icon bonus" style={{ outlineColor: 'gold' }} />
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
};


const SbDrops: React.FC<{
  players: Player[];
  allPlayers: Player[];
  stateData: Record<string, StatePoint[]>;
  scrubTime: number;
}> = ({ players, allPlayers, stateData, scrubTime }) => {
  // kd data is enemy:kills/trophies — kills = total, trophies = how many dropped a trophy
  // Collect per enemy across all visible players
  const enemyMap = new Map<string, { playerIdx: number; color: string; kills: number; trophies: number }[]>();

  for (const player of players) {
    const pid = getPlayerId(player);
    const idx = allPlayers.indexOf(player);
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const snapshot = findStateAtTime(stateData[pid], scrubTime);
    const kd = snapshot?.killDeaths || {};

    for (const [creature, [kills, trophies]] of Object.entries(kd)) {
      if (kills === 0 && trophies === 0) continue;
      if (!enemyMap.has(creature)) enemyMap.set(creature, []);
      enemyMap.get(creature)!.push({ playerIdx: idx, color, kills, trophies });
    }
  }

  // Sort enemies by total kills descending
  const enemies = [...enemyMap.entries()]
    .map(([name, entries]) => {
      const totalKills = entries.reduce((s, e) => s + e.kills, 0);
      const totalTrophies = entries.reduce((s, e) => s + e.trophies, 0);
      const dropRate = totalKills > 0 ? Math.round((totalTrophies / totalKills) * 100) : 0;
      return { name, totalKills, totalTrophies, dropRate, entries };
    })
    .sort((a, b) => b.totalKills - a.totalKills);

  if (enemies.length === 0) return <div className="sb-empty">No kill data available</div>;

  return (
    <div className="sb-drops">
      {enemies.map(({ name, dropRate, entries }) => (
        <div key={name} className="sb-drop-enemy">
          <div className="sb-drop-icon-wrap">
            <img src={`/img/Trophy/Trophy${name}.png`} alt={name} className="sb-drop-icon" title={name} />
            <span className="sb-drop-rate">{dropRate}%</span>
          </div>
          <div className="sb-drop-boxes">
            {entries.map((e, i) => {
              const boxes: React.ReactNode[] = [];
              // Filled boxes first = trophy drops
              for (let t = 0; t < e.trophies; t++) {
                boxes.push(
                  <span
                    key={`t${i}-${t}`}
                    className="sb-box filled"
                    style={{ borderColor: e.color, backgroundColor: e.color }}
                  />
                );
              }
              // Empty boxes = kills without trophy
              for (let k = 0; k < e.kills - e.trophies; k++) {
                boxes.push(
                  <span
                    key={`k${i}-${k}`}
                    className="sb-box"
                    style={{ borderColor: e.color }}
                  />
                );
              }
              return boxes;
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const SbEquip: React.FC<{
  players: Player[];
  allPlayers: Player[];
  stateData: Record<string, StatePoint[]>;
  scrubTime: number;
  itemDb: Map<string, DataItem> | null;
}> = ({ players, allPlayers, stateData, scrubTime, itemDb }) => {
  if (players.length === 0) return <div className="sb-empty">No players visible</div>;

  return (
    <div className="sb-equip">
      {players.map(player => {
        const pid = getPlayerId(player);
        const idx = allPlayers.indexOf(player);
        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        const snapshot = findStateAtTime(stateData[pid], scrubTime);
        const equip = snapshot?.equipment || {};
        const foods = snapshot?.foods || [];

        return (
          <div key={player.userId} className="sb-equip-player">
            <div className="sb-equip-row">
              {(['H', 'C', 'G', 'S'] as const).map(slot => {
                const code = equip[slot];
                const item = code ? itemDb?.get(code) : null;
                return (
                  <div
                    key={slot}
                    className={`sb-equip-box ${code ? '' : 'empty'}`}
                    style={{ borderColor: color }}
                    title={item?.name || code || EQUIP_SLOTS[slot]}
                  >
                    {item?.image && <img src={item.image} alt="" />}
                  </div>
                );
              })}
              <div className="sb-equip-stack">
                {(['U', 'T'] as const).map(slot => {
                  const code = equip[slot];
                  const item = code ? itemDb?.get(code) : null;
                  return (
                    <div
                      key={slot}
                      className={`sb-equip-box small ${code ? '' : 'empty'}`}
                      style={{ borderColor: color }}
                      title={item?.name || code || EQUIP_SLOTS[slot]}
                    >
                      {item?.image && <img src={item.image} alt="" />}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="sb-food-row">
              <div className="sb-food-boxes">
                {[0, 1, 2].map(i => {
                  const food = foods[i];
                  const item = food ? itemDb?.get(food) : null;
                  return (
                    <div
                      key={i}
                      className={`sb-equip-box ${food ? '' : 'empty'}`}
                      style={{ borderColor: color }}
                      title={item?.name || food || 'Food'}
                    >
                      {item?.image && <img src={item.image} alt="" />}
                    </div>
                  );
                })}
              </div>
              {snapshot && (
                <div className="sb-food-stats">
                  <span className="sb-food-stat hp">{snapshot.hpMax} HP</span>
                  <span className="sb-food-stat sp">{snapshot.spMax} SP</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SbSkills: React.FC<{
  players: Player[];
  allPlayers: Player[];
  stateData: Record<string, StatePoint[]>;
  scrubTime: number;
}> = ({ players, allPlayers, stateData, scrubTime }) => {
  // Collect all skills across visible players
  const skillMap = new Map<string, { color: string; level: number }[]>();

  for (const player of players) {
    const pid = getPlayerId(player);
    const idx = allPlayers.indexOf(player);
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const snapshot = findStateAtTime(stateData[pid], scrubTime);
    const sk = snapshot?.skills || {};

    for (const [name, level] of Object.entries(sk)) {
      if (!skillMap.has(name)) skillMap.set(name, []);
      skillMap.get(name)!.push({ color, level });
    }
  }

  // Order by SKILL_ORDER first, then any extras
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const s of SKILL_ORDER) {
    if (skillMap.has(s)) { ordered.push(s); seen.add(s); }
  }
  for (const s of skillMap.keys()) {
    if (!seen.has(s)) ordered.push(s);
  }

  if (ordered.length === 0) return <div className="sb-empty">No skills data</div>;

  return (
    <div className="sb-skills">
      {ordered.map(name => {
        const entries = skillMap.get(name)!;
        return (
          <div key={name} className="sb-skill-group">
            <span className="sb-skill-name">{name}</span>
            <div className="sb-skill-bars">
              {entries.map((e, i) => (
                <div key={i} className="sb-skill-bar">
                  <div className="sb-skill-fill" style={{ width: `${e.level}%`, backgroundColor: e.color }} />
                  <span className="sb-skill-val">{e.level}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EventMap;
