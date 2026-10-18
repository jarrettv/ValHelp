import { ALT_BIOME_INFO, BIOME_NAMES } from './altBiomeInfo';
import { BIOME_PATTERNS, type AltSector } from './biomePatterns';
import PatternMotif from './PatternMotif';
import { placeCard } from './mapCard';
import './MapCard.css';
import './AltBiomeCard.css';

// Hover card for a biome variant sector: which variant(s) it carries and what
// each changes. Small on purpose; positioned next to the cursor by the host,
// flipped to stay inside the map.

interface AltBiomeCardProps {
  sector: AltSector;
  x: number;        // cursor, in the map's own pixels
  y: number;
  width: number;    // map size, to keep the card inside it
  height: number;
}

export default function AltBiomeCard({ sector, x, y, width, height }: AltBiomeCardProps) {
  const alts = sector.alts.filter(a => ALT_BIOME_INFO[a]);
  if (!alts.length) return null;
  const biome = BIOME_NAMES[sector.biome] ?? sector.biome;

  return (
    <div className="map-card alt-card" style={placeCard(x, y, 36 + alts.length * 44, width, height)} role="tooltip">
      <div className="map-card-label alt-card-head">
        {biome} variant{alts.length > 1 ? `s · ${alts.length}` : ''}
      </div>
      {alts.map(name => {
        const info = ALT_BIOME_INFO[name];
        const look = BIOME_PATTERNS[name];
        return (
          <div className="alt-card-row" key={name}>
            {/* The variant's shape over a wash of its tint; tint alone, or neutral, without a pattern. */}
            <span className="alt-card-swatch" style={{ '--tint': look?.tint ?? '#6a7080' } as React.CSSProperties}>
              {look?.pattern
                ? <PatternMotif pattern={look.pattern} size={24} />
                : info.icon && <img src={info.icon} alt="" width={24} height={24} />}
            </span>
            <span className="alt-card-text">
              <span className="alt-card-name">
                {name}
                {info.stars && <span className="alt-card-stars" title={`Creatures ${info.stars}x as likely to have stars`}>★×{info.stars}</span>}
              </span>
              <span className="alt-card-blurb">{info.blurb}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
