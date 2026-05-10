import { useEffect, useMemo, useState } from 'react';
import { PoiMarker, resolvePoiIcon, getColoredIconDataUrl } from './poiIcons';
import './PoiLegend.css';

interface LegendEntry {
  icon: string;
  color: string;
  count: number;
}

// Hand-curated legend order. Keys can be either a bare icon name (matches any color)
// or "icon|color" for icons that need to split (the two axehead variants).
const LEGEND_ORDER: string[] = [
  'vegvisir',
  'beehive',
  'boar7',
  'axehead|#cd7f32',   // axehead1 — Mysterious (bronze)
  'axehead|#c0c0c0',   // axehead2 — Curious (silver)
  'chamber',
  'trollcave',
  'greydwarfnest',
  'sunkencrypt',
  'surtlingspawner',
  'egg',
  'mountaincave',
  'totem',
  'camp',
  'infestedmine',
  'putridhole',
  'shipwreck',
  'haldor',
  'bogwitch',
  'hildir',
  'boss',
  'fortress',
];

function legendRank(icon: string, color: string): number {
  const i1 = LEGEND_ORDER.indexOf(`${icon}|${color}`);
  if (i1 >= 0) return i1;
  const i2 = LEGEND_ORDER.indexOf(icon);
  if (i2 >= 0) return i2;
  return LEGEND_ORDER.length;     // unknowns sink to the end
}

export function buildLegend(pois: PoiMarker[]): LegendEntry[] {
  // Aggregate by (icon, color) so silver vs bronze axehead become separate toggles.
  // Skip 'start' — Sacrificial Stones is always shown and shouldn't be toggleable.
  const map = new Map<string, LegendEntry>();
  for (const p of pois) {
    const rule = resolvePoiIcon(p);
    if (!rule) continue;
    if (rule.icon === 'start') continue;
    const key = rule.icon + '|' + rule.color;
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { icon: rule.icon, color: rule.color, count: 1 });
  }
  return [...map.values()].sort(
    (a, b) => legendRank(a.icon, a.color) - legendRank(b.icon, b.color),
  );
}

function LegendSwatch({ icon, color }: { icon: string; color: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getColoredIconDataUrl(icon, color)
      .then(s => { if (!cancelled) setSrc(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [icon, color]);
  return src
    ? <img src={src} alt={icon} className="poi-legend-swatch" />
    : <span className="poi-legend-swatch" />;
}

interface PoiLegendProps {
  pois: PoiMarker[];
  hiddenIcons: ReadonlySet<string>;
  onToggle: (icon: string) => void;
  className?: string;
}

export default function PoiLegend({ pois, hiddenIcons, onToggle, className }: PoiLegendProps) {
  const legend = useMemo(() => buildLegend(pois), [pois]);
  if (legend.length === 0) return null;
  return (
    <div className={`poi-legend ${className ?? ''}`} aria-label="Marker filters">
      {legend.map(e => {
        const off = hiddenIcons.has(e.icon);
        return (
          <button
            key={e.icon + e.color}
            className={`poi-legend-btn ${off ? 'off' : ''}`}
            onClick={() => onToggle(e.icon)}
            title={e.icon}
          >
            <LegendSwatch icon={e.icon} color={e.color} />
            <span className="poi-legend-count">{e.count}</span>
          </button>
        );
      })}
    </div>
  );
}
