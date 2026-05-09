import React, { useRef, useEffect, useState, useCallback } from 'react';
import '../lib/vector-map.js';
import './WorldMap.css';
import {
  PoiMarker, resolvePoiIcon, getColoredIcon, subscribeIconRedraw,
  MINOR_ZOOM_THRESHOLD, MIN_MINOR_SCREEN_PX, MINOR_SIZE_FACTOR,
} from './poiIcons';

declare global {
  interface Window {
    VectorMap: {
      init: (canvas: HTMLCanvasElement, worldName: string, baseUrl?: string, forestUrl?: string) => Promise<void>;
      render: (viewScale: number, panX: number, panY: number, canvasW: number, canvasH: number) => void;
      getGridSize: () => number;
      destroy: () => void;
      ready: boolean;
    };
  }
}

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

interface WorldMapProps {
  seed: string;
  baseUrl: string;          // e.g. `/api/worlds/${seed}` — supplies biomes/mask/pois
  forestUrl?: string;       // override for the static forest tile (default `${baseUrl}/forest`)
  poisUrl?: string;         // optional override; defaults to `${baseUrl}/pois`
  className?: string;
  onPoiClick?: (poi: PoiMarker) => void;
  /// Set of icon names (e.g. 'boss', 'axehead') to suppress from rendering — driven
  /// by the parent's legend toggles. Markers whose resolved icon is in this set are
  /// skipped in both the draw loop and the click hit-test.
  hiddenIcons?: ReadonlySet<string>;
  /// Called once after the /pois fetch resolves so the parent can populate a legend.
  onPoisLoaded?: (pois: PoiMarker[]) => void;
}

const WorldMap: React.FC<WorldMapProps> = ({
  seed, baseUrl, forestUrl, poisUrl, className, onPoiClick, hiddenIcons, onPoisLoaded,
}) => {
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const poisRef = useRef<PoiMarker[]>([]);
  // Mirror hiddenIcons into a ref so drawMarkers (memoized with empty deps) sees the
  // current value without rebuilding the callback chain on every prop change.
  const hiddenIconsRef = useRef<ReadonlySet<string> | undefined>(hiddenIcons);
  hiddenIconsRef.current = hiddenIcons;

  const stateRef = useRef({
    scale: 1, panX: 0, panY: 0,
    imgW: 0, imgH: 0,
    dragging: false, lastMX: 0, lastMY: 0,
    rafId: 0,
    ready: false,
  });

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

    const { scale, panX, panY, imgW } = stateRef.current;
    if (imgW === 0) return;

    const gs = window.VectorMap.getGridSize();
    const mScale = imgW / gs;

    // vhcli sizing: marker shrinks with zoom-out (m.s * scale, capped at maxScreenPx).
    // World-pixel base size matches vhcli's MarkerDataBuilder iconSize for outSize=2048.
    const baseWorldSize = 24;
    const maxScreenPx = 32;
    const minorAllowed = scale >= MINOR_ZOOM_THRESHOLD;
    const hidden = hiddenIconsRef.current;
    for (const poi of poisRef.current) {
      const rule = resolvePoiIcon(poi);
      if (!rule) continue;
      if (hidden && hidden.has(rule.icon)) continue;
      // Two-stage minor gate: require the global zoom threshold AND a per-marker
      // minimum screen size. Together they keep the reveal smooth instead of cliffed.
      if (rule.minor && !minorAllowed) continue;
      // Cap first, then halve for minors — so they stay visibly smaller at full zoom
      // (where majors hit the 32-px cap and minors hit cap × MINOR_SIZE_FACTOR).
      const cappedMajor = Math.min(maxScreenPx, baseWorldSize * scale * (rule.sizeScale ?? 1));
      const screenSize = rule.minor ? cappedMajor * MINOR_SIZE_FACTOR : cappedMajor;
      if (rule.minor && screenSize < MIN_MINOR_SCREEN_PX) continue;

      const [ppx, ppy] = worldToPixel(poi.x, poi.z, gs);
      const sx = ppx * mScale * scale + panX;
      const sy = ppy * mScale * scale + panY;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

      const sz = screenSize;
      const icon = getColoredIcon(rule.icon, rule.color);
      // `complete` is true once the data-URL Image has rasterized (or errored).
      // We don't gate on naturalWidth — some browsers report 0 for SVGs that draw fine.
      if (icon && icon.complete) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 1;
        ctx.globalAlpha = rule.opacity ?? 1;
        try {
          ctx.drawImage(icon, sx - sz / 2, sy - sz / 2, sz, sz);
        } catch { /* ignore broken icon, marker just skips */ }
        ctx.restore();
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

  // Load map
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const glCanvas = glCanvasRef.current;
        if (!glCanvas) return;

        await window.VectorMap.init(glCanvas, seed, baseUrl, forestUrl);
        if (cancelled) return;

        fetch(poisUrl ?? `${baseUrl}/pois`)
          .then(r => r.ok ? r.json() : [])
          .then((pois: PoiMarker[]) => {
            poisRef.current = pois;
            onPoisLoaded?.(pois);
            scheduleUpdate();
          })
          .catch(() => {});

        const gs = window.VectorMap.getGridSize();
        const s = stateRef.current;
        s.imgW = gs;
        s.imgH = gs;
        s.ready = true;

        setLoading(false);
        setMapReady(true);
        fitMap();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Map not available');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      window.VectorMap.destroy();
      stateRef.current.ready = false;
      setMapReady(false);
    };
  }, [seed, baseUrl, forestUrl, poisUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize
  useEffect(() => {
    const onResize = () => { if (stateRef.current.ready) fitMap(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitMap]);

  // Redraw when colored POI icons finish loading.
  useEffect(() => subscribeIconRedraw(scheduleUpdate), [scheduleUpdate]);

  // Redraw when the parent toggles a legend entry.
  useEffect(() => { if (mapReady) scheduleUpdate(); }, [hiddenIcons, mapReady, scheduleUpdate]);

  // Pan/zoom + click → POI
  useEffect(() => {
    const area = mapAreaRef.current;
    if (!area || !mapReady) return;

    let downX = 0, downY = 0, didDrag = false;

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
      downX = e.clientX; downY = e.clientY; didDrag = false;
      area!.classList.add('dragging');
    }

    function onMouseMove(e: MouseEvent) {
      const s = stateRef.current;
      if (!s.dragging) return;
      s.panX += e.clientX - s.lastMX;
      s.panY += e.clientY - s.lastMY;
      s.lastMX = e.clientX;
      s.lastMY = e.clientY;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) didDrag = true;
      scheduleUpdate();
    }

    function onMouseUp(e: MouseEvent) {
      const wasDragging = stateRef.current.dragging;
      stateRef.current.dragging = false;
      area!.classList.remove('dragging');
      if (wasDragging && !didDrag && onPoiClick) {
        // Click without drag — hit-test POIs
        const rect = area!.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const hit = hitTestPoi(cx, cy);
        if (hit) onPoiClick(hit);
      }
    }

    function hitTestPoi(cx: number, cy: number): PoiMarker | null {
      const { scale, panX, panY, imgW } = stateRef.current;
      if (imgW === 0) return null;
      const gs = window.VectorMap.getGridSize();
      const mScale = imgW / gs;
      const minorAllowed = scale >= MINOR_ZOOM_THRESHOLD;
      const hidden = hiddenIconsRef.current;
      // Iterate in reverse so the topmost-drawn marker wins on overlap.
      for (let i = poisRef.current.length - 1; i >= 0; i--) {
        const poi = poisRef.current[i];
        const rule = resolvePoiIcon(poi);
        if (!rule) continue;
        if (hidden && hidden.has(rule.icon)) continue;
        if (rule.minor && !minorAllowed) continue;
        const cappedMajor = Math.min(32, 24 * scale * (rule.sizeScale ?? 1));
        const screenSize = rule.minor ? cappedMajor * MINOR_SIZE_FACTOR : cappedMajor;
        if (rule.minor && screenSize < MIN_MINOR_SCREEN_PX) continue;
        const r = screenSize / 2;
        const [ppx, ppy] = worldToPixel(poi.x, poi.z, gs);
        const sx = ppx * mScale * scale + panX;
        const sy = ppy * mScale * scale + panY;
        if (Math.abs(sx - cx) <= r && Math.abs(sy - cy) <= r) return poi;
      }
      return null;
    }

    let lastTouchDist = 0, lastTouchMidX = 0, lastTouchMidY = 0, touching = false;

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
        lastTouchDist = Math.hypot(dx, dy);
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
        const dist = Math.hypot(dx, dy);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = area!.getBoundingClientRect();
        const mx = midX - rect.left, my = midY - rect.top;
        const factor = lastTouchDist > 0 ? dist / lastTouchDist : 1;
        const minScale = Math.min(area!.clientWidth / s.imgW, area!.clientHeight / s.imgH) * 0.5;
        const newScale = Math.min(Math.max(s.scale * factor, minScale), 20);
        s.panX = mx - (mx - s.panX) * (newScale / s.scale) + (midX - lastTouchMidX);
        s.panY = my - (my - s.panY) * (newScale / s.scale) + (midY - lastTouchMidY);
        s.scale = newScale;
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
  }, [scheduleUpdate, mapReady, onPoiClick]);

  return (
    <div className={`world-map ${className ?? ''}`} ref={mapAreaRef}>
      {loading && <div className="world-map-status">Loading map…</div>}
      {error && <div className="world-map-status error">{error}</div>}
      <canvas ref={glCanvasRef} className="world-map-gl" />
      <canvas ref={markerCanvasRef} className="world-map-markers" />
    </div>
  );
};

export default WorldMap;
export type { PoiMarker };
