// Vector complexity of an SVG icon — what it costs to ship and to draw.
// Used by the POI icons admin report to spot art worth simplifying.

export interface SvgStats {
  bytes: number;
  elements: number;        // every element, including groups and defs
  geometry: number;        // drawable shapes: path, circle, rect, ellipse, line, polyline, polygon
  paths: number;
  commands: number;        // path segments (M/L/C/... including implicit repeats)
  points: number;          // anchor + control points across all geometry
  maxDecimals: number;     // most decimal places on any number — precision you're paying for
  hasCurrentColor: boolean;
  viewBox: string | null;
}

const GEOMETRY = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon']);

// Numbers each path command consumes, and how many of them are points.
const ARITY: Record<string, { nums: number; points: number }> = {
  m: { nums: 2, points: 1 }, l: { nums: 2, points: 1 }, t: { nums: 2, points: 1 },
  h: { nums: 1, points: 1 }, v: { nums: 1, points: 1 },
  c: { nums: 6, points: 3 }, s: { nums: 4, points: 2 }, q: { nums: 4, points: 2 },
  a: { nums: 7, points: 1 }, z: { nums: 0, points: 0 },
};

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function decimalsOf(text: string): number {
  let max = 0;
  for (const n of text.match(NUMBER) ?? []) {
    const dot = n.indexOf('.');
    if (dot < 0) continue;
    const frac = n.slice(dot + 1).replace(/[eE].*$/, '');
    if (frac.length > max) max = frac.length;
  }
  return max;
}

/** Segment and point counts for a path `d`, honouring implicit command repeats. */
export function pathComplexity(d: string): { commands: number; points: number } {
  let commands = 0, points = 0;
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    const arity = ARITY[cmd.toLowerCase()];
    if (!arity) { i++; continue; }
    i++;
    if (arity.nums === 0) { commands++; continue; }
    // A command letter may be followed by several argument groups.
    let groups = 0;
    while (i + arity.nums <= tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
      i += arity.nums;
      groups++;
    }
    commands += Math.max(groups, 1);
    points += groups * arity.points;
  }
  return { commands, points };
}

export function svgStats(svgText: string): SvgStats {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const all = Array.from(doc.getElementsByTagName('*'));
  let geometry = 0, paths = 0, commands = 0, points = 0, maxDecimals = 0;
  for (const el of all) {
    const tag = el.localName;
    if (!GEOMETRY.has(tag)) continue;
    geometry++;
    if (tag === 'path') {
      paths++;
      const d = el.getAttribute('d') ?? '';
      const c = pathComplexity(d);
      commands += c.commands;
      points += c.points;
      maxDecimals = Math.max(maxDecimals, decimalsOf(d));
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = el.getAttribute('points') ?? '';
      const n = Math.floor((pts.match(NUMBER) ?? []).length / 2);
      points += n;
      commands += n;
      maxDecimals = Math.max(maxDecimals, decimalsOf(pts));
    } else {
      // Primitive shapes: one drawing op; a few defining points each.
      commands += 1;
      points += tag === 'line' ? 2 : tag === 'rect' ? 4 : 1;
    }
  }
  return {
    bytes: new Blob([svgText]).size,
    elements: all.length,
    geometry,
    paths,
    commands,
    points,
    maxDecimals,
    hasCurrentColor: svgText.includes('currentColor'),
    viewBox: doc.documentElement.getAttribute('viewBox'),
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
