import { NavLink, Outlet } from 'react-router';
import {
  WeaponsIcon,
  GearIcon,
  FoodIcon,
  ComfortIcon,
  EnemiesIcon,
  WeatherIcon,
} from './navIcons';
import './GuidesLayout.css';

type SideItem = { to: string; label: string; Icon: () => React.ReactNode };

const SIDE_ITEMS: SideItem[] = [
  { to: '/guides/weapons', label: 'Weapons', Icon: WeaponsIcon },
  { to: '/guides/gear', label: 'Gear', Icon: GearIcon },
  { to: '/guides/food', label: 'Food', Icon: FoodIcon },
  { to: '/guides/comfort', label: 'Comfort', Icon: ComfortIcon },
  { to: '/guides/enemies', label: 'Enemies', Icon: EnemiesIcon },
  { to: '/guides/weather', label: 'Weather', Icon: WeatherIcon },
];

export default function GuidesLayout() {
  return (
    <div className="vh-guides">
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
