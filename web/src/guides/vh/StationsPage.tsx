// ── Workstation guides ────────────────────────────────────────────
// Left: every station that things are crafted at, locked until the spoiler
// slider reaches the biome that unlocks it. Right: that station's build cost,
// each upgrade piece with its own cost, and everything it can make — all of it
// gated by the same `sp-b<index>` classes the item lists use, so the page
// fills in as the reader progresses rather than dumping 82 recipes at someone
// who just landed in the Meadows.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useVhItems, useVhDefaults, iconUrl } from './data';
import { renderStationPage } from './vhRender.raw';
import { subscribe, getChangeCounter, initVhState } from './vhRender';
import { getRevealedCount, subscribeSpoiler, biomeLabel } from './spoiler';
import { STATION_PAGES } from './biomeSheets';
import Feedback from '../../components/Feedback';
import SEO from '../../components/SEO';

const BACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);

export default function StationsPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { data: items } = useVhItems();
  const { data: defaults } = useVhDefaults();
  const revealed = useSyncExternalStore(subscribeSpoiler, getRevealedCount, getRevealedCount);
  const tick = useSyncExternalStore(subscribe, getChangeCounter);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (items && defaults !== undefined) initVhState(items, defaults);
  }, [items, defaults]);

  useEffect(() => {
    window.__vhNavigate = (path: string) => navigate(path);
  }, [navigate]);

  const isLocked = (biome: number) => revealed <= biome;
  const station = code ? STATION_PAGES.find(s => s.code === code) : undefined;

  useEffect(() => {
    if (ref.current && station && items) ref.current.innerHTML = renderStationPage(station.code);
  }, [station, items, tick]);

  if (code && !station) return <Navigate to="/guides/stations" replace />;
  // Sliding the spoiler back down while reading a later station closes it.
  if (station && isLocked(station.biome)) return <Navigate to="/guides/stations" replace />;

  const byName = (c: string) => items?.find(i => i.code === c)?.name ?? c;

  return (
    <div className={`vh-items-container${station ? ' show-tips' : ''}`}>
      <SEO
        title={station ? `Valheim ${byName(station.code)} — Recipes and Upgrades` : 'Valheim Workstations — Every Crafting Station'}
        description={station
          ? `${byName(station.code)} build cost, every upgrade piece, and the full list of what it crafts.`
          : 'Every Valheim crafting station: build costs, upgrade pieces, and what each one makes.'}
        path={station ? `/guides/stations/${station.code}` : '/guides/stations'}
      />
      <div className="vh-items-left">
        <div className="vh-items-categories">
          <div className="vh-cat-grid vh-st-grid">
            {STATION_PAGES.map(s => {
              const locked = isLocked(s.biome);
              return (
                <div
                  key={s.code}
                  className={`vh-cat-card ${code === s.code ? 'active' : ''}${locked ? ' locked' : ''}`}
                  role="button"
                  aria-disabled={locked}
                  title={locked ? `Unlocks in ${biomeLabel(s.biome)}` : byName(s.code)}
                  onClick={locked ? undefined : () => navigate(`/guides/stations/${s.code}`)}
                >
                  <img className="cat-icon" src={iconUrl(s.code)} alt="" />
                  <div className="vh-cat-card-label">{locked ? '???' : byName(s.code)}</div>
                  {locked && <span className="vh-cat-lock" aria-hidden="true">🔒</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="vh-items-detail" key={code ?? 'index'}>
        {station && (
          <button className="vh-detail-back" onClick={() => navigate('/guides/stations')}>
            {BACK_ICON} Workstations
          </button>
        )}
        {station
          ? <div className="vh-md" ref={ref} />
          : <div className="vh-stub">Pick a workstation to see what it builds, what upgrades it takes, and everything it can craft.</div>}
        <Feedback />
      </div>
    </div>
  );
}
