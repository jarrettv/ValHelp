import { useEffect, useSyncExternalStore } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  WeaponsIcon,
  GearIcon,
  FoodIcon,
  ComfortIcon,
  EnemiesIcon,
  WeatherIcon,
  ArticlesIcon,
} from './navIcons';
import { getRevealedCount, subscribeSpoiler, syncSpoilerWithServer, clearSpoilerSync } from './spoiler';
import { useAuth } from '../../contexts/AuthContext';
import './GuidesLayout.css';

type SideItem = { to: string; label: string; Icon: () => React.ReactNode };

const SIDE_ITEMS: SideItem[] = [
  { to: '/guides/articles', label: 'Articles', Icon: ArticlesIcon },
  { to: '/guides/weapons', label: 'Weapons', Icon: WeaponsIcon },
  { to: '/guides/gear', label: 'Gear', Icon: GearIcon },
  { to: '/guides/food', label: 'Food', Icon: FoodIcon },
  { to: '/guides/comfort', label: 'Comfort', Icon: ComfortIcon },
  { to: '/guides/enemies', label: 'Enemies', Icon: EnemiesIcon },
  { to: '/guides/weather', label: 'Weather', Icon: WeatherIcon },
];

export default function GuidesLayout() {
  const revealed = useSyncExternalStore(subscribeSpoiler, getRevealedCount, getRevealedCount);
  const { status } = useAuth();

  // Sync the spoiler level with the logged-in user's prefs (server wins on login).
  useEffect(() => {
    const id = status?.id;
    if (id && id > 0) syncSpoilerWithServer(id);
    else clearSpoilerSync();
  }, [status?.id]);

  return (
    <div className="vh-guides" data-spoiler={revealed}>
      <nav className="vh-sidebar">
        {SIDE_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) => `vh-nav-btn ${isActive ? 'active' : ''}`}
          >
            <Icon />
          </NavLink>
        ))}
      </nav>
      <div className="vh-main">
        <Outlet />
      </div>
    </div>
  );
}
