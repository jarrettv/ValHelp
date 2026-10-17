import { useEffect, useMemo, useState } from 'react';
import { PoiMarker, resolvePoiIcon, getColoredIconDataUrl, usePoiConfigVersion } from './poiIcons';
import './PoiLegend.css';

// Map marker key: collapsed to one "Markers" pill by default; opened, it shows
// a handful of group toggles (Finds, Dungeons, ...) with each group's
// individual marker types one tap further in. Toggles act on the icon name,
// which is what WorldMap/EventMap filter by.

interface LegendEntry {
  icon: string;
  color: string;   // swatch colour (the first one seen when an icon has several)
  label: string;
  count: number;
}

interface LegendGroup {
  key: string;
  label: string;
  entries: LegendEntry[];
  count: number;
}

// Groups in display order. Icons are listed in their order within the group;
// anything unlisted (new art, admin-uploaded icons) lands in "Other".
const GROUPS: { key: string; label: string; icons: string[] }[] = [
  { key: 'finds',    label: 'Finds',            icons: ['vegvisir', 'egg'] },
  { key: 'dungeons', label: 'Dungeons & caves', icons: ['chamber', 'trollcave', 'sunkencrypt', 'mountaincave', 'infestedmine', 'fortress', 'morkhalla', 'bearcave'] },
  { key: 'camps',    label: 'Camps & ruins',    icons: ['greydwarfnest', 'totem', 'camp', 'stonetower', 'boar7', 'dvergrtower', 'dvergrhouse', 'putridhole', 'tormentelite', 'surtlingspawner', 'northhut'] },
  { key: 'wrecks',   label: 'Shipwrecks',       icons: ['shipwreck', 'shipwrecksnow', 'frozenship'] },
  { key: 'npcs',     label: 'Bosses & traders', icons: ['boss', 'haldor', 'hildir', 'bogwitch', 'cauldron'] },
];

const LABELS: Record<string, string> = {
  vegvisir: 'Vegvisirs', egg: 'Drake nests',
  chamber: 'Burial chambers', trollcave: 'Troll caves', sunkencrypt: 'Sunken crypts',
  mountaincave: 'Frost caves', infestedmine: 'Infested mines', fortress: 'Charred fortresses',
  morkhalla: 'Mörkhalla', bearcave: 'Bear caves',
  greydwarfnest: 'Greydwarf nests', totem: 'Fuling camps', camp: 'Camps', stonetower: 'Stone towers',
  boar7: 'Boar runestones', dvergrtower: 'Dvergr towers', dvergrhouse: 'Dvergr houses',
  putridhole: 'Putrid holes', tormentelite: 'Places of mystery', surtlingspawner: 'Geysers',
  northhut: 'North huts',
  shipwreck: 'Shipwrecks', shipwrecksnow: 'Snowy shipwrecks', frozenship: 'Frozen ships',
  boss: 'Boss altars', haldor: 'Haldor', hildir: 'Hildir', bogwitch: 'Bog Witch', cauldron: 'Traders',
};

function groupOf(icon: string) {
  return GROUPS.find(g => g.icons.includes(icon));
}

export function buildLegend(pois: PoiMarker[]): LegendGroup[] {
  // One entry per icon: the map hides by icon, so two colours of the same icon
  // (silver and bronze axe heads) were always one toggle anyway.
  // Skip 'start' — Sacrificial Stones is always shown and shouldn't be toggleable.
  const byIcon = new Map<string, LegendEntry & { types: Map<string, number> }>();
  for (const p of pois) {
    const rule = resolvePoiIcon(p);
    if (!rule || rule.icon === 'start') continue;
    let e = byIcon.get(rule.icon);
    if (!e) {
      e = { icon: rule.icon, color: rule.color, label: '', count: 0, types: new Map() };
      byIcon.set(rule.icon, e);
    }
    e.count++;
    e.types.set(p.type, (e.types.get(p.type) ?? 0) + 1);
  }
  const groups: LegendGroup[] = [...GROUPS, { key: 'other', label: 'Other', icons: [] }]
    .map(g => ({ key: g.key, label: g.label, entries: [] as LegendEntry[], count: 0 }));
  for (const e of byIcon.values()) {
    // Unknown icons fall back to the POI type they mostly mark.
    const label = LABELS[e.icon] ?? [...e.types.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const g = groups.find(x => x.key === (groupOf(e.icon)?.key ?? 'other'))!;
    g.entries.push({ icon: e.icon, color: e.color, label, count: e.count });
    g.count += e.count;
  }
  for (const g of groups) {
    const order = groupOf(g.entries[0]?.icon ?? '')?.icons ?? [];
    g.entries.sort((a, b) => (order.indexOf(a.icon) + 1 || 99) - (order.indexOf(b.icon) + 1 || 99)
      || a.label.localeCompare(b.label));
  }
  return groups.filter(g => g.entries.length > 0);
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
    ? <img src={src} alt="" className="poi-legend-swatch" />
    : <span className="poi-legend-swatch" />;
}

const OPEN_KEY = 'vh-map-legend-open';
function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function writeOpen(v: boolean) {
  try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* private mode: just don't remember */ }
}

const LayersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" />
  </svg>
);
const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

interface PoiLegendProps {
  pois: PoiMarker[];
  hiddenIcons: ReadonlySet<string>;
  onToggle: (icon: string) => void;
  className?: string;
}

export default function PoiLegend({ pois, hiddenIcons, onToggle, className }: PoiLegendProps) {
  const configVersion = usePoiConfigVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- configVersion invalidates resolvePoiIcon's overrides
  const groups = useMemo(() => buildLegend(pois), [pois, configVersion]);
  const [open, setOpen] = useState(readOpen);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (groups.length === 0) return null;

  const allIcons = groups.flatMap(g => g.entries.map(e => e.icon));
  const hiddenCount = allIcons.filter(i => hiddenIcons.has(i)).length;

  const toggleOpen = () => { setOpen(o => { writeOpen(!o); return !o; }); };
  // Flip only the icons whose state differs from the target.
  const setIcons = (icons: string[], hide: boolean) => {
    for (const i of icons) if (hiddenIcons.has(i) !== hide) onToggle(i);
  };
  const toggleExpanded = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (!open) {
    return (
      <div className={`poi-legend collapsed ${className ?? ''}`}>
        <button className="poi-legend-pill" onClick={toggleOpen} aria-expanded="false" title="Show map marker filters">
          <LayersIcon />
          <span>Markers</span>
          {hiddenCount > 0 && <span className="poi-legend-badge">{hiddenCount} hidden</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`poi-legend ${className ?? ''}`} aria-label="Marker filters">
      <div className="poi-legend-head">
        <LayersIcon />
        <span className="poi-legend-title">Markers</span>
        {hiddenCount > 0 && (
          <button className="poi-legend-link" onClick={() => setIcons(allIcons, false)}>Show all</button>
        )}
        <button className="poi-legend-close" onClick={toggleOpen} aria-expanded="true" title="Collapse">
          <Chevron open={false} />
        </button>
      </div>
      <div className="poi-legend-body">
        {groups.map(g => {
          const icons = g.entries.map(e => e.icon);
          const shown = icons.filter(i => !hiddenIcons.has(i)).length;
          const state = shown === 0 ? 'off' : shown === icons.length ? 'on' : 'some';
          const isOpen = expanded.has(g.key);
          return (
            <div key={g.key} className={`poi-legend-group ${state}`}>
              <div className="poi-legend-row">
                <button className="poi-legend-toggle" onClick={() => setIcons(icons, state !== 'off')}
                        aria-pressed={state !== 'off'} title={state === 'off' ? `Show ${g.label}` : `Hide ${g.label}`}>
                  <span className="poi-legend-group-icon">
                    <LegendSwatch icon={g.entries[0].icon} color={g.entries[0].color} />
                  </span>
                  <span className="poi-legend-label">{g.label}</span>
                  <span className="poi-legend-count">{state === 'some' ? `${shown}/${icons.length}` : g.count}</span>
                </button>
                {g.entries.length > 1 && (
                  <button className="poi-legend-more" onClick={() => toggleExpanded(g.key)}
                          aria-expanded={isOpen} title={isOpen ? 'Hide types' : 'Pick types'}>
                    <Chevron open={isOpen} />
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="poi-legend-items">
                  {g.entries.map(e => (
                    <button key={e.icon} className={`poi-legend-item ${hiddenIcons.has(e.icon) ? 'off' : ''}`}
                            onClick={() => onToggle(e.icon)} aria-pressed={!hiddenIcons.has(e.icon)}>
                      <LegendSwatch icon={e.icon} color={e.color} />
                      <span className="poi-legend-label">{e.label}</span>
                      <span className="poi-legend-count">{e.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
