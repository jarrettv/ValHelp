// POI marker layer, shared by WorldMap and EventMap.
//
// What a POI draws as comes only from its LOD's zoom band (lodStyle in
// poiIcons.ts): every POI of a LOD looks the same at a given zoom, whatever is
// around it. Overlaps are settled by draw order, lower LOD on top, which also
// decides which marker a click hits.
//
// Speed comes from doing little per frame, not from hiding markers:
//  * POIs are resolved once (when the POIs, hidden icons or admin config
//    change) into a spatial index, so a frame only visits the ones in view.
//  * Each icon is pre-rendered with its drop shadow into a bitmap per
//    (icon, colour, size), and each dot colour likewise; a frame is just
//    drawImage calls, with one alpha change per LOD.

import {
  type PoiMarker, type IconRule, resolvePoiIcon, lodStyle, getColoredIcon, getPoiConfig, DOT_PX, type LodStyle,
  adornAlpha, adornGrowth, adornProgress, requestPoiRedraw,
} from './poiIcons';
import { type Adornment, adornDataKey, poiAdornments } from './poiAdorn';

// Valheim minimap: 2048 texels, 12 world units per texel, half-pixel offset.
const TEX_SIZE = 2048;
const PIXEL_SIZE = 12;
const HALF_PIXEL = PIXEL_SIZE / 2;

/// World (x, z) -> unit map coordinates (0..1, y down), the same for every map size.
export function worldToUnit(worldX: number, worldZ: number): [number, number] {
  const texX = (worldX - HALF_PIXEL) / PIXEL_SIZE + TEX_SIZE / 2;
  const texY = (worldZ - HALF_PIXEL) / PIXEL_SIZE + TEX_SIZE / 2;
  return [texX / TEX_SIZE, 1 - texY / TEX_SIZE];
}

const DOT_HIT_PX = 7;          // dots are tiny; give them a finger-sized target
const MARGIN_PX = 110;          // draw markers this far past the edge (half an icon, its adornments, shadow)
const MIN_HIT_ALPHA = 0.4;     // a marker still fading in isn't clickable yet
const SPATIAL_CELLS = 64;      // spatial index: 64x64 buckets over the map

interface Item { poi: PoiMarker; rule: IconRule; lod: number; ux: number; uy: number; adorn?: Adornment[] }

/// An adornment's size, as a fraction of its POI's icon: when they appear, and
/// at full zoom (they grow over the last steps, adornGrowth in poiIcons.ts).
const ADORN_SIZE = 0.6;
const ADORN_SIZE_MAX = 0.85;
/// The ring's radius is this much past snug against the icon, and moves out by
/// a further fraction of the icon (ADORN_SPREAD) steadily over the adornment
/// zooms; full grown, neighbours leave a gap of ADORN_GAP of their size.
const ADORN_RING = 1.2;
const ADORN_SPREAD = 0.35;
const ADORN_GAP = 0.25;
/// Adornment centres sit this fraction of their size inside the icon's edge
/// (POI art rarely fills its square, so this keeps them snug against it).
const ADORN_INSET = 0.1;
/// The angle between neighbours: what spaces them a gap apart when full grown.
const FULL_STEP = (ADORN_SIZE_MAX * (1 + ADORN_GAP)) / ((0.5 - ADORN_SIZE_MAX * ADORN_INSET) * ADORN_RING + ADORN_SPREAD);
/// The ring starts below the icon and runs clockwise.
const ADORN_START = Math.PI / 2;

/** One view of the map: unit map coordinates -> screen px is `u * size + pan`. */
export interface View { size: number; panX: number; panY: number; scale: number; width: number; height: number }

interface Drawn { poi: PoiMarker; x: number; y: number; r: number }

export class PoiLayer {
  private items: Item[] = [];
  private buckets: number[][] = [];
  private key: unknown[] = [];
  /** Clickable markers from the last frame, in draw order (topmost last). */
  private drawn: Drawn[] = [];
  private animating = false;

  /** Whether the last frame drew something that animates (adornment glows): keep redrawing. */
  isAnimating(): boolean { return this.animating; }

  /** Resolve rules and rebuild the index when POIs, hidden icons, the admin config or the contents data change. */
  private prepare(pois: readonly PoiMarker[], hidden: ReadonlySet<string> | undefined) {
    const key = [pois, hidden, getPoiConfig(), ...adornDataKey()];
    if (key.length === this.key.length && key.every((k, i) => k === this.key[i])) return;
    this.key = key;
    const items: Item[] = [];
    for (const poi of pois) {
      const rule = resolvePoiIcon(poi);
      if (!rule || hidden?.has(rule.icon)) continue;
      const [ux, uy] = worldToUnit(poi.x, poi.z);
      const adorn = poiAdornments(poi);
      items.push({ poi, rule, lod: Math.max(0, Math.min(3, rule.lod ?? 0)), ux, uy,
                   adorn: adorn.length ? adorn : undefined });
    }
    // Stable sort, least important first: drawing in this order puts LOD 0 on top.
    items.sort((a, b) => b.lod - a.lod);
    this.items = items;
    this.buckets = Array.from({ length: SPATIAL_CELLS * SPATIAL_CELLS }, () => []);
    items.forEach((it, i) => this.buckets[cellOf(it.uy) * SPATIAL_CELLS + cellOf(it.ux)].push(i));
  }

  /** Indices of the items in view (plus the margin), in draw order. */
  private visible(v: View): number[] {
    const x0 = cellOf((-v.panX - MARGIN_PX) / v.size), x1 = cellOf((v.width - v.panX + MARGIN_PX) / v.size);
    const y0 = cellOf((-v.panY - MARGIN_PX) / v.size), y1 = cellOf((v.height - v.panY + MARGIN_PX) / v.size);
    const out: number[] = [];
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (const i of this.buckets[cy * SPATIAL_CELLS + cx]) out.push(i);
    return out.sort((a, b) => a - b);
  }

  draw(ctx: CanvasRenderingContext2D, pois: readonly PoiMarker[], hidden: ReadonlySet<string> | undefined, v: View) {
    this.prepare(pois, hidden);
    const dpr = ctx.getTransform().a || 1;
    const styles = [0, 1, 2, 3].map(l => lodStyle(l, v.scale));
    const styleOf = (it: Item): LodStyle =>
      it.rule.sizeScale && it.rule.sizeScale !== 1 ? lodStyle(it.lod, v.scale, it.rule.sizeScale) : styles[it.lod];

    const shown: { it: Item; x: number; y: number }[] = [];
    for (const i of this.visible(v)) {
      const it = this.items[i];
      const st = styles[it.lod];
      if (st.dotAlpha <= 0 && st.iconAlpha <= 0) continue;
      const x = it.ux * v.size + v.panX, y = it.uy * v.size + v.panY;
      if (x < -MARGIN_PX || x > v.width + MARGIN_PX || y < -MARGIN_PX || y > v.height + MARGIN_PX) continue;
      shown.push({ it, x, y });
    }

    const drawn: Drawn[] = [];
    let alpha = -1;
    const setAlpha = (a: number) => { if (a !== alpha) ctx.globalAlpha = alpha = a; };

    const adornA = adornAlpha(v.scale), adornG = adornGrowth(v.scale), adornP = adornProgress(v.scale);
    const pulse = glowPulse(performance.now());
    let animating = false;

    // Dots under every icon, then icons (each with its adornments); both least important first.
    for (const { it, x, y } of shown) {
      const st = styles[it.lod];
      if (st.dotAlpha <= 0) continue;
      const dot = dotSprite(it.rule.color, dpr);
      setAlpha(st.dotAlpha);
      ctx.drawImage(dot.canvas, x - dot.half, y - dot.half, dot.css, dot.css);
      if (st.dotAlpha >= MIN_HIT_ALPHA) drawn.push({ poi: it.poi, x, y, r: DOT_HIT_PX });
    }
    for (const { it, x, y } of shown) {
      const st = styleOf(it);
      if (st.iconAlpha <= 0) continue;
      const sprite = spriteFor(it.rule.icon, it.rule.color, st.iconSize, dpr);
      if (!sprite) continue;   // still loading; its onload redraws
      setAlpha(st.iconAlpha * (it.rule.opacity ?? 1));
      ctx.drawImage(sprite.canvas, x - sprite.half, y - sprite.half, sprite.css, sprite.css);
      if (st.iconAlpha >= MIN_HIT_ALPHA) drawn.push({ poi: it.poi, x, y, r: st.iconSize / 2 });
      if (it.adorn && adornA > 0) {
        setAlpha(st.iconAlpha * adornA);
        drawAdornments(ctx, it.adorn, x, y, st.iconSize, adornG, adornP, it.rule.color, pulse, dpr);
        animating = true;
      }
    }
    setAlpha(1);
    this.drawn = drawn;
    this.animating = animating && !reducedMotion();
  }

  /** The topmost marker under (x, y) in the last frame. */
  /// `slop` widens the target (a fingertip): with no exact hit, the nearest
  /// marker within that many extra px wins.
  hitTest(x: number, y: number, slop = 0): PoiMarker | null {
    let best: PoiMarker | null = null, bestDist = Infinity;
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i];
      const dx = Math.abs(d.x - x), dy = Math.abs(d.y - y);
      if (dx <= d.r && dy <= d.r) return d.poi;
      const dist = Math.hypot(dx, dy) - d.r;
      if (dist <= slop && dist < bestDist) { best = d.poi; bestDist = dist; }
    }
    return best;
  }
}

function cellOf(u: number): number {
  return Math.max(0, Math.min(SPATIAL_CELLS - 1, Math.floor(u * SPATIAL_CELLS)));
}

// ── Sprites ──────────────────────────────────────────────────────────────────
// An icon with its drop shadow, rasterized once per (icon, colour, px size):
// shadowBlur per draw call is what made busy frames slow. Keyed by the
// coloured Image, so new art (an upload, a dev edit) gets new sprites.

const SHADOW_PAD = 7;   // shadowBlur 6 + offsetY 1
// ImageBitmaps, not canvases: drawing a canvas into another can snapshot it on
// every call, which made close-up frames slower than drawing the SVG directly.
interface Sprite { canvas: CanvasImageSource; css: number; half: number }

/// Render `paint` (in css px, `css` square) into an immutable bitmap.
function bake(css: number, dpr: number, paint: (c: OffscreenCanvasRenderingContext2D) => void): CanvasImageSource {
  const canvas = new OffscreenCanvas(Math.ceil(css * dpr), Math.ceil(css * dpr));
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  paint(c);
  return canvas.transferToImageBitmap();
}
const sprites = new WeakMap<HTMLImageElement, Map<string, Sprite>>();

function spriteFor(icon: string, color: string, size: number, dpr: number): Sprite | null {
  return spriteOf(getColoredIcon(icon, color), size, dpr);
}

/// Item icons (/api/icon/<code>.png) for adornments; null until loaded, or for one the API lacks.
const pngs = new Map<string, HTMLImageElement>();
function itemIcon(code: string): HTMLImageElement | null {
  let img = pngs.get(code);
  if (!img) {
    img = new Image();
    img.onload = requestPoiRedraw;
    img.src = `/api/icon/${encodeURIComponent(code)}.png`;
    pngs.set(code, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/// A POI's adornments, in a ring around its icon (centred on x, y, `size` px),
/// each on a glow in its own colour or the POI's dot colour. `grow`: 0-1, how far into the last
/// zoom steps (bigger). `spread`: 0-1 through the adornment zooms (further out, at the
/// same angles, so they move straight out from the centre). `pulse`: 0-1, the glow's breath.
function drawAdornments(ctx: CanvasRenderingContext2D, adorn: readonly Adornment[], x: number, y: number,
                        size: number, grow: number, spread: number, color: string, pulse: number, dpr: number) {
  const px = size * (ADORN_SIZE + (ADORN_SIZE_MAX - ADORN_SIZE) * grow);
  const radius = (size / 2 - px * ADORN_INSET) * ADORN_RING + size * ADORN_SPREAD * spread;
  // Each keeps its angle at every zoom, so growing only moves it straight out
  // from the POI. The angles are what puts full-grown neighbours a gap apart
  // (or, too many for that, evenly round); smaller and nearer in, they still clear.
  const step = Math.min((Math.PI * 2) / adorn.length, FULL_STEP);
  const glowCss = glowSprite(px, color, dpr).css;
  const gs = glowCss * (GLOW_SCALE_MIN + (GLOW_SCALE_MAX - GLOW_SCALE_MIN) * pulse), gh = gs / 2;
  const alpha = ctx.globalAlpha;
  adorn.forEach((a, i) => {
    const sprite = 'svg' in a ? spriteFor(a.svg, a.color, px, dpr) : spriteOf(itemIcon(a.png), px, dpr);
    if (!sprite) return;
    const t = ADORN_START + i * step;
    const ax = x + Math.cos(t) * radius, ay = y + Math.sin(t) * radius;
    ctx.globalAlpha = alpha * (GLOW_ALPHA_MIN + (1 - GLOW_ALPHA_MIN) * pulse);
    ctx.drawImage(glowSprite(px, a.glow ?? color, dpr).canvas, ax - gh, ay - gh, gs, gs);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.canvas, ax - sprite.half, ay - sprite.half, sprite.css, sprite.css);
  });
}

// The light behind each adornment (they're the admin's starred favourites):
// the POI's dot colour, breathing between these sizes and strengths.
const GLOW_SPAN = 1.3;          // glow diameter, in adornment sizes (at full breath)
const GLOW_SCALE_MIN = 0.8, GLOW_SCALE_MAX = 1;
const GLOW_ALPHA_MIN = 0.45;
const GLOW_PULSE_MS = 1600;

/// 0-1-0 over GLOW_PULSE_MS, eased; steady (1) for reduced motion.
function glowPulse(now: number): number {
  if (reducedMotion()) return 1;
  return 0.5 - 0.5 * Math.cos((now % GLOW_PULSE_MS) / GLOW_PULSE_MS * Math.PI * 2);
}

const motionQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function reducedMotion(): boolean { return !!motionQuery?.matches; }

/// '#rgb' / '#rrggbb' -> 'r,g,b' (white for anything else).
function rgbOf(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0xffffff;
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const glows = new Map<string, Sprite>();
function glowSprite(px: number, color: string, dpr: number): Sprite {
  const size = Math.max(1, Math.round(px));
  const key = `${size}|${color}|${dpr}`;
  let sprite = glows.get(key);
  if (sprite) return sprite;
  const css = Math.ceil(size * GLOW_SPAN);
  const rgb = rgbOf(color);
  const canvas = bake(css, dpr, c => {
    const g = c.createRadialGradient(css / 2, css / 2, 0, css / 2, css / 2, css / 2);
    g.addColorStop(0, `rgba(${rgb},0.95)`);
    g.addColorStop(0.55, `rgba(${rgb},0.6)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, css, css);
  });
  sprite = { canvas, css, half: css / 2 };
  glows.set(key, sprite);
  return sprite;
}

function spriteOf(img: HTMLImageElement | null, size: number, dpr: number): Sprite | null {
  // `complete` is true once the data-URL Image has rasterized (or errored);
  // an empty src means the SVG text is still being fetched.
  if (!img || !img.complete || !img.src) return null;
  const px = Math.max(1, Math.round(size));
  const key = `${px}|${dpr}`;
  let bySize = sprites.get(img);
  const hit = bySize?.get(key);
  if (hit) return hit;
  const css = px + SHADOW_PAD * 2;
  const canvas = bake(css, dpr, c => {
    c.shadowColor = 'rgba(0,0,0,0.9)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 1;
    try { c.drawImage(img, SHADOW_PAD, SHADOW_PAD, px, px); } catch { /* broken icon: an empty sprite */ }
  });
  const sprite = { canvas, css, half: css / 2 };
  if (!bySize) sprites.set(img, bySize = new Map());
  bySize.set(key, sprite);
  return sprite;
}

/// A dot (filled circle with a dark outline) per colour.
const dots = new Map<string, Sprite>();
function dotSprite(color: string, dpr: number): Sprite {
  const key = `${color}|${dpr}`;
  let sprite = dots.get(key);
  if (sprite) return sprite;
  const css = DOT_PX + 2;
  const canvas = bake(css, dpr, c => {
    c.beginPath();
    c.arc(css / 2, css / 2, DOT_PX / 2, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.stroke();
  });
  sprite = { canvas, css, half: css / 2 };
  dots.set(key, sprite);
  return sprite;
}
