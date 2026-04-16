import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import User from './components/User'

// ── Inline SVG icons (lucide-style outline) ─────────────────────
const Icon = ({ children, ...rest }: { children: React.ReactNode } & React.SVGProps<SVGSVGElement>) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);
const HomeIcon = () => <Icon><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" /></Icon>;
const TrophyIcon = () => <Icon><path d="M6 4h12v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V4z" /><path d="M6 4H3v3a3 3 0 0 0 3 3" /><path d="M18 4h3v3a3 3 0 0 1-3 3" /><path d="M10 17h4v4h-4z" /><path d="M8 21h8" /></Icon>;
const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512">
    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M32 160v296a8 8 0 0 0 8 8h136V160a16 16 0 0 0-16-16H48a16 16 0 0 0-16 16M320 48H192a16 16 0 0 0-16 16v400h160V64a16 16 0 0 0-16-16m144 160H352a16 16 0 0 0-16 16v240h136a8 8 0 0 0 8-8V224a16 16 0 0 0-16-16" />
  </svg>
);
const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v14m4-9h2m-2-4h2M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3a3 3 0 0 0-3-3zm3-6h2M6 8h2" />
  </svg>
);
const CalcIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M8 6h8m0 8v4m0-8h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" />
    </g>
  </svg>
);
// ── Nav items ────────────────────────────────────────────────────
type NavItem = { to: string; label: string; icon: () => React.ReactNode; end?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/events/all', label: 'Events', icon: TrophyIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: ListIcon },
  { to: '/guides', label: 'Guides', icon: BookIcon },
  { to: '/trophy/calc', label: 'Calc', icon: CalcIcon },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Track SPA navigations with GoatCounter
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).goatcounter?.count) {
      (window as any).goatcounter.count({ path: location.pathname + location.search });
    }
  }, [location.pathname, location.search]);

  return (
    <main className="layout">
      <title>Valheim Help</title>
      <header>
        <NavLink to="/" className="brand">
          <img src="/valheim-logo.webp" alt="Valheim Help" />
        </NavLink>
        <button
          className="nav-hamburger"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
        <nav className={`top-nav ${menuOpen ? 'open' : ''}`}>
          {NAV_ITEMS.map(item => {
            const IconComp = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <IconComp />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <div className="nav-spacer" />
          <div className="nav-user">
            <User />
          </div>
        </nav>
      </header>
      <article>
        <Outlet />
      </article>
    </main>
  )
}
