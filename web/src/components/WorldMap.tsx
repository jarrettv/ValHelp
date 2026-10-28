import React, { useRef, useEffect, useState, useCallback } from 'react';
import '../lib/vector-map.js';
import './WorldMap.css';
import { PoiMarker, subscribeIconRedraw, usePoiConfigVersion, MAP_MAX_SCALE, WHEEL_ZOOM_STEP } from './poiIcons';
import { PoiLayer } from './poiLayer';
import { loadPatternOverlay, variantLuts, type PatternOverlay, type AltSector } from './biomePatterns';
import AltBiomeCard from './AltBiomeCard';

declare global {
  interface Window {
    VectorMap: {
      init: (canvas: HTMLCanvasElement, worldName: string, baseUrl?: string, forestUrl?: string,
             urls?: { biomes?: string; mask?: string }) => Promise<void>;
      render: (viewScale: number, panX: number, panY: number, canvasW: number, canvasH: number) => void;
      getGridSize: () => number;
      setPatternOverlay: (o: import('./biomePatterns').PatternOverlay | null) => void;
      setVariantLuts: (lut: Uint8Array, strokeLut: Uint8Array) => void;
      isPulsing: () => boolean;
      destroy: () => void;
      ready: boolean;
    };
  }
}

interface WorldMapProps {
  seed: string;
  baseUrl: string;          // e.g. `/api/worlds/${seed}` — supplies biomes/mask/pois
  forestUrl?: string;       // override for the static forest tile (default `${baseUrl}/forest`)
  poisUrl?: string;         // optional override; defaults to `${baseUrl}/pois`
  /// Overrides for the vector map and mask (e.g. blob: URLs of a map generated in
  /// the browser); `altBiomes: false` skips the biome variant overlay.
  assets?: { biomes?: string; mask?: string; altBiomes?: boolean };
  className?: string;
  /// A click on a POI marker (poi, and where in the map's own pixels), or on
  /// empty map (null).
  onPoiClick?: (poi: PoiMarker | null, at: { x: number; y: number }) => void;
  /// The POI marker under the cursor (null when none), for a hover card.
  onPoiHover?: (hover: { poi: PoiMarker; x: number; y: number } | null) => void;
  /// Set of icon names (e.g. 'boss', 'axehead') to suppress from rendering — driven
  /// by the parent's legend toggles. Markers whose resolved icon is in this set are
  /// skipped in both the draw loop and the click hit-test.
  hiddenIcons?: ReadonlySet<string>;
  /// Called once after the /pois fetch resolves so the parent can populate a legend.
  onPoisLoaded?: (pois: PoiMarker[]) => void;
  /// The zoom after each redraw, relative to the whole map fitted in view (1).
  onZoom?: (zoom: number) => void;
}

const WorldMap: React.FC<WorldMapProps> = ({
  seed, baseUrl, forestUrl, poisUrl, assets, className, onPoiClick, onPoiHover, hiddenIcons, onPoisLoaded, onZoom,
}) => {
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const poisRef = useRef<PoiMarker[]>([]);
  const layerRef = useRef(new PoiLayer());
  // Biome variant data, for the hover card (null until loaded / none for this seed).
  const overlayRef = useRef<PatternOverlay | null>(null);
  const [hover, setHover] = useState<{ sector: AltSector; x: number; y: number } | null>(null);
  const onPoiHoverRef = useRef(onPoiHover);
  onPoiHoverRef.current = onPoiHover;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
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

    // Only the POIs in view, decluttered by LOD (see poiLayer.ts).
    layerRef.current.draw(ctx, poisRef.current, hiddenIconsRef.current,
      { size: imgW * scale, panX, panY, scale, width: w, height: h });
  }, []);

  const applyTransform = useCallback(() => {
    // Clear the pending frame first: a frame that lands before the map is ready
    // (e.g. the POI config fetch beating the map data) must not leave rafId set,
    // or scheduleUpdate would never schedule again and the map stays black.
    stateRef.current.rafId = 0;
    const area = mapAreaRef.current;
    if (!area || !stateRef.current.ready) return;
    const { scale, panX, panY } = stateRef.current;
    window.VectorMap.render(scale, panX, panY, area.clientWidth, area.clientHeight);
    drawMarkers();
    const { imgW, imgH } = stateRef.current;
    if (onZoomRef.current && imgW > 0) onZoomRef.current(scale / Math.min(area.clientWidth / imgW, area.clientHeight / imgH));
  }, [drawMarkers]);

  const scheduleUpdate = useCallback(() => {
    if (!stateRef.current.rafId) {
      stateRef.current.rafId = requestAnimationFrame(applyTransform);
    }
  }, [applyTransform]);

  // Biome variant strokes pulse (vector-map.js), and so do adornment glows
  // (poiLayer.ts): while either is drawn, redraw just that canvas at ~30 fps.
  useEffect(() => {
    let id = 0, last = 0;
    const tick = (t: number) => {
      id = requestAnimationFrame(tick);
      const s = stateRef.current, area = mapAreaRef.current;
      if (t - last < 33 || s.rafId || !s.ready || !area) return;
      const map = !!window.VectorMap?.isPulsing?.(), markers = layerRef.current.isAnimating();
      if (!map && !markers) return;
      last = t;
      if (map) window.VectorMap.render(s.scale, s.panX, s.panY, area.clientWidth, area.clientHeight);
      if (markers) drawMarkers();
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [drawMarkers]);

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

        await window.VectorMap.init(glCanvas, seed, baseUrl, forestUrl,
          assets ? { biomes: assets.biomes, mask: assets.mask } : undefined);
        if (cancelled) return;

        // Biome variant patterns (Mushroom, ...): optional, seeds made before
        // they were recorded just don't get them.
        (assets?.altBiomes === false ? Promise.resolve(null) : loadPatternOverlay(baseUrl))
          .then(o => {
            if (cancelled || !o) return;
            overlayRef.current = o;
            window.VectorMap.setPatternOverlay(o);
            scheduleUpdate();
          })
          .catch(err => console.warn('[WorldMap] biome patterns unavailable', err));

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
      overlayRef.current = null;
      setHover(null);
      window.VectorMap.destroy();
      stateRef.current.ready = false;
      setMapReady(false);
    };
  }, [seed, baseUrl, forestUrl, poisUrl, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize (the window, or the page around the map, e.g. the site header hidden):
  // keep the same point in the middle and the same zoom.
  useEffect(() => {
    const area = mapAreaRef.current;
    if (!area) return;
    let w = area.clientWidth, h = area.clientHeight;
    const ro = new ResizeObserver(() => {
      const nw = area.clientWidth, nh = area.clientHeight;
      if (nw === w && nh === h) return;
      const s = stateRef.current;
      s.panX += (nw - w) / 2;
      s.panY += (nh - h) / 2;
      w = nw; h = nh;
      if (s.ready) scheduleUpdate();
    });
    ro.observe(area);
    return () => ro.disconnect();
  }, [scheduleUpdate]);

  // Biome variant colours or visibility edited (or the config arrived after the
  // overlay): rebuild just the colour tables.
  const configVersion = usePoiConfigVersion();
  useEffect(() => {
    const o = overlayRef.current;
    if (!o || !mapReady) return;
    const { lut, strokeLut } = variantLuts(o.sectors, o.slotOf);
    window.VectorMap.setVariantLuts(lut, strokeLut);
    scheduleUpdate();
  }, [configVersion, mapReady, scheduleUpdate]);

  // Redraw when colored POI icons finish loading.
  useEffect(() => subscribeIconRedraw(scheduleUpdate), [scheduleUpdate]);

  // Redraw when the parent toggles a legend entry.
  useEffect(() => { if (mapReady) scheduleUpdate(); }, [hiddenIcons, mapReady, scheduleUpdate]);

  // Pan/zoom + click → POI
  useEffect(() => {
    const area = mapAreaRef.current;
    if (!area || !mapReady) return;

    let downX = 0, downY = 0, didDrag = false;

    // Biome variant hover card: which sector (if any) is under the cursor.
    // Updated at most once a frame; hidden while dragging or over a POI marker.
    let hoverX = -1, hoverY = -1, hoverRaf = 0;
    /// The biome variant sector at a point in the map's own pixels, if any.
    function sectorAt(x: number, y: number): AltSector | undefined {
      const o = overlayRef.current, s = stateRef.current;
      if (!o || s.imgW === 0) return undefined;
      const size = s.imgW * s.scale;
      const ux = (x - s.panX) / size, uy = (y - s.panY) / size;
      if (ux < 0 || ux >= 1 || uy < 0 || uy >= 1) return undefined;
      // The grid runs south to north, the map north to south.
      const entry = o.grid[Math.floor((1 - uy) * o.size) * o.size + Math.floor(ux * o.size)];
      return entry ? o.sectors[entry - 1] : undefined;
    }
    function showSector(x: number, y: number) {
      const sector = sectorAt(x, y);
      setHover(prev => (sector
        ? (prev && prev.sector === sector && prev.x === x && prev.y === y ? prev : { sector, x, y })
        : null));
    }
    function updateHover() {
      hoverRaf = 0;
      const s = stateRef.current;
      const poi = s.dragging || hoverX < 0 ? null : layerRef.current.hitTest(hoverX, hoverY);
      onPoiHoverRef.current?.(poi ? { poi, x: hoverX, y: hoverY } : null);
      if (poi || s.dragging || hoverX < 0) { setHover(null); return; }
      showSector(hoverX, hoverY);
    }
    function queueHover() { if (!hoverRaf) hoverRaf = requestAnimationFrame(updateHover); }
    function onAreaMove(e: MouseEvent) {
      const rect = area!.getBoundingClientRect();
      hoverX = e.clientX - rect.left;
      hoverY = e.clientY - rect.top;
      queueHover();
    }
    function onAreaLeave() { hoverX = -1; queueHover(); }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const s = stateRef.current;
      if (s.imgW === 0) return;
      const rect = area!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const minScale = Math.min(area!.clientWidth / s.imgW, area!.clientHeight / s.imgH) * 0.5;
      const newScale = Math.min(Math.max(s.scale * factor, minScale), MAP_MAX_SCALE);
      s.panX = mx - (mx - s.panX) * (newScale / s.scale);
      s.panY = my - (my - s.panY) * (newScale / s.scale);
      s.scale = newScale;
      scheduleUpdate();
      queueHover();   // the map moved under the cursor
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      stateRef.current.dragging = true;
      stateRef.current.lastMX = e.clientX;
      stateRef.current.lastMY = e.clientY;
      downX = e.clientX; downY = e.clientY; didDrag = false;
      area!.classList.add('dragging');
      queueHover();
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
      queueHover();
      if (wasDragging && !didDrag && onPoiClick) {
        // Click without drag — hit-test POIs
        const rect = area!.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        // Hit-test what the last frame actually drew, topmost first.
        const hit = layerRef.current.hitTest(cx, cy);
        onPoiClick(hit, { x: cx, y: cy });
      }
    }

    let lastTouchDist = 0, lastTouchMidX = 0, lastTouchMidY = 0, touching = false;
    // A tap (one finger, barely moved) stands in for both click and hover:
    // there is no hover on touch, so it opens the POI or biome variant card.
    let tapX = 0, tapY = 0, isTap = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        e.preventDefault();
        const s = stateRef.current;
        s.dragging = true;
        s.lastMX = e.touches[0].clientX;
        s.lastMY = e.touches[0].clientY;
        tapX = s.lastMX; tapY = s.lastMY; isTap = true;
        area!.classList.add('dragging');
      } else if (e.touches.length === 2) {
        e.preventDefault();
        touching = true;
        isTap = false;
        setHover(null);
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
        if (isTap && Math.hypot(s.lastMX - tapX, s.lastMY - tapY) > 8) {
          isTap = false;
          setHover(null);   // the card is placed in screen space, it would drift
        }
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
        const newScale = Math.min(Math.max(s.scale * factor, minScale), MAP_MAX_SCALE);
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
        if (isTap) {
          isTap = false;
          const rect = area!.getBoundingClientRect();
          const cx = tapX - rect.left, cy = tapY - rect.top;
          const hit = layerRef.current.hitTest(cx, cy, 12);
          onPoiClick?.(hit, { x: cx, y: cy });
          if (hit) setHover(null); else showSector(cx, cy);
        }
      }
    }

    area.addEventListener('wheel', onWheel, { passive: false });
    area.addEventListener('mousemove', onAreaMove);
    area.addEventListener('mouseleave', onAreaLeave);
    area.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    area.addEventListener('touchstart', onTouchStart, { passive: false });
    area.addEventListener('touchmove', onTouchMove, { passive: false });
    area.addEventListener('touchend', onTouchEnd);
    return () => {
      area.removeEventListener('wheel', onWheel);
      area.removeEventListener('mousemove', onAreaMove);
      area.removeEventListener('mouseleave', onAreaLeave);
      area.removeEventListener('mousedown', onMouseDown);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
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
      {hover && mapAreaRef.current && (
        <AltBiomeCard sector={hover.sector} x={hover.x} y={hover.y}
          width={mapAreaRef.current.clientWidth} height={mapAreaRef.current.clientHeight} />
      )}
    </div>
  );
};

export default WorldMap;
export type { PoiMarker };
