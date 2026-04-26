import { Link } from 'react-router';
import { useVhDoc } from '../guides/vh/data';
import {
  WeaponsIcon,
  GearIcon,
  FoodIcon,
  ComfortIcon,
  EnemiesIcon,
  WeatherIcon,
} from '../guides/vh/navIcons';
import './HomeGuidesCard.css';

type LatestUpdate = { text: string; route: string };

function parseLatestGuideUpdate(md: string): LatestUpdate | null {
  const lines = md.split('\n');
  let inLatestDate = false;
  const bullets: string[] = [];
  for (const raw of lines) {
    if (/^##\s+\d{4}-\d{2}-\d{2}/.test(raw)) {
      if (inLatestDate) break;
      inLatestDate = true;
      continue;
    }
    if (!inLatestDate) continue;
    if (/^##\s/.test(raw)) break;
    const m = /^[-*]\s+(.*)$/.exec(raw.trim());
    if (m) bullets.push(m[1]);
  }
  for (const b of bullets) {
    const lower = b.toLowerCase();
    if (/\bweapon/.test(lower)) return { text: b, route: '/guides/weapons' };
    if (/\b(gear|armor|helmet)/.test(lower)) return { text: b, route: '/guides/gear' };
    if (/\bcomfort/.test(lower)) return { text: b, route: '/guides/comfort' };
    if (/\b(enem|bestiary|creature|mob)/.test(lower)) return { text: b, route: '/guides/enemies' };
    if (/\b(food|consumable)/.test(lower)) return { text: b, route: '/guides/food' };
  }
  if (bullets.length > 0) return { text: bullets[0], route: '/guides' };
  return null;
}

const TAGS = [
  { to: '/guides/weapons', label: 'Weapons', Icon: WeaponsIcon },
  { to: '/guides/gear', label: 'Gear', Icon: GearIcon },
  { to: '/guides/food', label: 'Food & Meads', Icon: FoodIcon },
  { to: '/guides/comfort', label: 'Comfort', Icon: ComfortIcon },
  { to: '/guides/enemies', label: 'Enemies', Icon: EnemiesIcon },
  { to: '/guides/weather', label: 'Weather & Wind', Icon: WeatherIcon },
];

export default function HomeGuidesCard() {
  const { data } = useVhDoc('changelog');
  const latest = data ? parseLatestGuideUpdate(data) : null;

  return (
    <div className="guides-card">
      <div className="guides-card-desc">
        Weapons, armor, trinkets, food, comfort, and bestiary — find recipes, stats, mechanics, and tips.
      </div>
      <div className="guides-card-tags">
        {TAGS.map(({ to, label, Icon }) => (
          <Link key={to} to={to}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </div>
      {latest && (
        <div className="guides-card-update">
          <Link to={latest.route} className="guides-card-update-link">
            <span className="guides-card-update-label">Recent updates</span>
            <span className="guides-card-update-text">{latest.text}</span>
          </Link>
          <Link to="/guides/changelog" className="guides-card-update-more">
            View full changelog →
          </Link>
        </div>
      )}
    </div>
  );
}
