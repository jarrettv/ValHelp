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

import { type PoiMarker, type IconRule, resolvePoiIcon, lodStyle, getColoredIcon, getPoiConfig, DOT_PX, type LodStyle } from './poiIcons';

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
const MARGIN_PX = 40;          // draw markers this far past the edge (half an icon + shadow)
const MIN_HIT_ALPHA = 0.4;     // a marker still fading in isn't clickable yet
const SPATIAL_CELLS = 64;      // spatial index: 64x64 buckets over the map

interface Item { poi: PoiMarker; rule: IconRule; lod: number; ux: number; uy: number }

/** One view of the map: unit map coordinates -> screen px is `u * size + pan`. */
export interface View { size: number; panX: number; panY: number; scale: number; width: number; height: number }

interface Drawn { poi: PoiMarker; x: number; y: number; r: number }

export class PoiLayer {
  private items: Item[] = [];
  private buckets: number[][] = [];
  private key: unknown[] = [];
  /** Clickable markers from the last frame, in draw order (topmost last). */
  private drawn: Drawn[] = [];

  /** Resolve rules and rebuild the index when POIs, hidden icons or the admin config change. */
  private prepare(pois: readonly PoiMarker[], hidden: ReadonlySet<string> | undefined) {
    const key = [pois, hidden, getPoiConfig()];
    if (key.every((k, i) => k === this.key[i])) return;
    this.key = key;
    const items: Item[] = [];
    for (const poi of pois) {
      const rule = resolvePoiIcon(poi);
      if (!rule || hidden?.has(rule.icon)) continue;
      const [ux, uy] = worldToUnit(poi.x, poi.z);
      items.push({ poi, rule, lod: Math.max(0, Math.min(3, rule.lod ?? 0)), ux, uy });
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

    // Dots under every icon, then icons; both least important first.
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
    }
    setAlpha(1);
    this.drawn = drawn;
  }

  /** The topmost marker under (x, y) in the last frame. */
  hitTest(x: number, y: number): PoiMarker | null {
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i];
      if (Math.abs(d.x - x) <= d.r && Math.abs(d.y - y) <= d.r) return d.poi;
    }
    return null;
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
  const img = getColoredIcon(icon, color);
  // `complete` is true once the data-URL Image has rasterized (or errored);
  // an empty src means the SVG text is still being fetched.
  if (!img.complete || !img.src) return null;
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
