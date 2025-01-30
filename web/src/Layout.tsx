import { Outlet } from 'react-router'
import User from './components/User'

export default function Layout() {
  return (
    <main className="home-page">
      <header>
        <div>
          <a href="/">
            <img src="/valheim-logo.webp" alt="Valheim" />
          </a>
          <h1>Valheim Help</h1>
          <User />
        </div>
      </header>
      <article>
        <Outlet />
      </article>
    </main>
  )
}
