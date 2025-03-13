import { Outlet, useLocation } from 'react-router'
import User from './components/User'

export default function Layout() {
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/auth/profile':
        return 'User Profile';
      case '/auth/login':
        return 'Login';
      default:
        return 'Welcome';
    }
  };

  return (
    <main className="layout">
      <title>{`Valheim Help - ${getPageTitle()}`}</title>
      <header>
        <div>
          <a href="/">
            <img src="/valheim-logo.webp" alt="Valheim" />
          </a>
          <h1>{getPageTitle()}</h1>
          <User />
        </div>
      </header>
      <article>
        <Outlet />
      </article>
    </main>
  )
}
