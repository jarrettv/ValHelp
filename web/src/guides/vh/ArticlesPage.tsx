import { useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { biomeIconUrl } from './data';
import { getProgress, setProgress, subscribeSpoiler, getRevealedCount, biomeIndex, SPOILER_BIOMES } from './spoiler';
import TipsMarkdown from './TipsMarkdown';
import Feedback from '../../components/Feedback';

// ── Spoiler slider ────────────────────────────────────────────────
// Biomes (from spoiler.ts, progression order). Drag right to reveal each one
// from black-and-white to full colour. Deep North has no art (snowflake).
const SnowflakeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" />
    <path d="M12 5l-2.2 2.2M12 5l2.2 2.2M12 19l-2.2-2.2M12 19l2.2-2.2M5 12l2.2-2.2M5 12l2.2 2.2M19 12l-2.2-2.2M19 12l-2.2 2.2" />
  </svg>
);

function BiomeSpoilerSlider() {
  const n = SPOILER_BIOMES.length;
  const val = useSyncExternalStore(subscribeSpoiler, getProgress, getProgress);
  return (
    <div className="biome-spoiler">
      <div className="biome-spoiler__header">
        <h1 className="biome-spoiler__title">
          Valheim <span className="biome-spoiler__title-em">&ldquo;spoiler-free&rdquo;</span> Guide
        </h1>
        <p className="biome-spoiler__subtitle">
          World&rsquo;s first spoiler-free guide. Choose your progress, unlock more of the guide as you play.
        </p>
      </div>
      <div className="biome-spoiler__track">
        {SPOILER_BIOMES.map((b, i) => {
          const reveal = Math.max(0, Math.min(1, val - i));
          const revealed = reveal >= 0.999;
          return (
            <div
              key={b.label}
              className={`biome-spoiler__biome${revealed ? ' revealed' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Unlock up to ${b.label}`}
              title={`Unlock up to ${b.label}`}
              onClick={() => setProgress(i + 1)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProgress(i + 1); }
              }}
            >
              <div
                className="biome-spoiler__bubble"
                style={{
                  filter: `grayscale(${1 - reveal}) brightness(${0.55 + 0.45 * reveal})`,
                  opacity: 0.3 + 0.7 * reveal,
                  transform: `scale(${0.85 + 0.15 * reveal})`,
                }}
              >
                {b.icon ? <img src={biomeIconUrl(b.icon)} alt="" /> : <SnowflakeIcon />}
              </div>
              <span className="biome-spoiler__label">{b.label}</span>
            </div>
          );
        })}
      </div>
      <input
        type="range"
        min={1}
        max={n}
        step={0.02}
        value={val}
        onChange={e => setProgress(parseFloat(e.target.value))}
        className="biome-spoiler__range"
        style={{ ['--pct' as string]: `${((val - 1) / (n - 1)) * 100}%` }}
        aria-label="Reveal biomes"
      />
      <p className="biome-spoiler__disclaimer">
        ⚠ The &ldquo;spoiler-free&rdquo; system is still under construction and is not yet guaranteed to be spoiler-free. Use with caution.
      </p>
    </div>
  );
}

// Articles mirror the Enemies screen: a "Game overview and tips" tips-row at the
// top (the landing), then one card per biome. Each entry just renders a markdown
// doc from /data/vh/docs/<doc>.md — edit those files to fill in the guides. Add a
// biome row here + a matching docs/biome_*.md to extend it.
const OVERVIEW = { slug: 'overview', label: 'Game overview and tips', doc: 'articles_overview' };

type Biome = { slug: string; label: string; biome: string; doc: string };
const BIOMES: Biome[] = [
  { slug: 'meadows',      label: 'Meadows',      biome: 'Meadows',     doc: 'biome_meadows' },
  { slug: 'black-forest', label: 'Black Forest', biome: 'BlackForest', doc: 'biome_blackforest' },
  { slug: 'swamp',        label: 'Swamp',        biome: 'Swamp',       doc: 'biome_swamp' },
  { slug: 'mountain',     label: 'Mountain',     biome: 'Mountains',   doc: 'biome_mountain' },
  { slug: 'plains',       label: 'Plains',       biome: 'Plains',      doc: 'biome_plains' },
  { slug: 'ocean',        label: 'Ocean',        biome: 'Ocean',       doc: 'biome_ocean' },
  { slug: 'mistlands',    label: 'Mistlands',    biome: 'Mistlands',   doc: 'biome_mistlands' },
  { slug: 'ashlands',     label: 'Ashlands',     biome: 'Ashlands',    doc: 'biome_ashlands' },
];

const TIPS_ICON = (
  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m1 15h-2v-6h2zm0-8h-2V7h2z" /></svg>
);
const BACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);

export default function ArticlesPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const revealed = useSyncExternalStore(subscribeSpoiler, getRevealedCount, getRevealedCount);

  // A biome is unlocked once the spoiler slider has revealed it (revealed > index).
  const isBiomeLocked = (b: Biome) => {
    const idx = biomeIndex(b.slug);
    return idx !== null && revealed <= idx;
  };

  const biome = slug ? BIOMES.find(b => b.slug === slug) : undefined;
  const isOverview = slug === OVERVIEW.slug;
  if (slug && !biome && !isOverview) return <Navigate to="/guides/articles" replace />;

  // Guard: can't open a biome guide that isn't unlocked yet (also catches sliding
  // the spoiler back down while viewing one).
  if (biome && isBiomeLocked(biome)) return <Navigate to="/guides/articles" replace />;

  // No slug → default to the overview doc (shown on the right on desktop; on mobile
  // the category grid shows until a card is tapped). `explicit` drives the mobile
  // takeover, matching the Enemies "tips" behaviour.
  const selectedDoc = biome ? biome.doc : OVERVIEW.doc;
  const selectedKey = biome ? biome.slug : OVERVIEW.slug;
  const explicit = !!slug;
  const containerClass = `vh-items-container${explicit ? ' show-tips' : ''}`;

  return (
    <div className={containerClass}>
      <div className="vh-items-left">
        <div className="vh-items-categories">
          <div className="vh-cat-grid">
            <div className="vh-tips-row">
              <div
                className={`vh-tips-card ${selectedKey === OVERVIEW.slug ? 'active' : ''}`}
                onClick={() => navigate(`/guides/articles/${OVERVIEW.slug}`)}
              >
                {TIPS_ICON}
                <span className="vh-tips-label">{OVERVIEW.label}</span>
              </div>
            </div>
            {BIOMES.map(b => {
              const locked = isBiomeLocked(b);
              return (
                <div
                  key={b.slug}
                  className={`vh-cat-card ${selectedKey === b.slug ? 'active' : ''}${locked ? ' locked' : ''}`}
                  role="button"
                  aria-disabled={locked}
                  title={locked ? `Unlock ${b.label} with the spoiler slider` : b.label}
                  onClick={locked ? undefined : () => navigate(`/guides/articles/${b.slug}`)}
                >
                  <img className="cat-icon" src={biomeIconUrl(b.biome)} alt="" />
                  <div className="vh-cat-card-label">{b.label}</div>
                  {locked && <span className="vh-cat-lock" aria-hidden="true">🔒</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="vh-items-detail" key={selectedKey}>
        {explicit && (
          <button className="vh-detail-back" onClick={() => navigate('/guides/articles')}>
            {BACK_ICON} Guides
          </button>
        )}
        {!biome && <BiomeSpoilerSlider />}
        <TipsMarkdown name={selectedDoc} />
        <Feedback />
      </div>
    </div>
  );
}
