import { Outlet } from 'react-router'
import { Link } from 'react-router'

export default function Layout() {
  return (
    <main className="home-page">
      <header>
        <div>
          <a href="/">
            <img src="/valheim-logo.webp" alt="Valheim" />
          </a>
          <h1>Valheim Help</h1>
          <div id="user-icon" style={{display:"none"}}>
            {/* <User width="32" height="32" style="vertical-align:middle;margin:0 0.5rem" /> */}
            <span id="user-name">Unknown</span>
          </div>
          <Link to="/auth/login" id="user-login" style={{margin:"0.5rem 0 0 1rem"}}>Login</Link>
          <Link to="/auth/profile" id="user-profile" style={{margin:"0.5rem 0 0 1rem"}}>Profile</Link>
        </div>
      </header>
      <article>
        <Outlet />
      </article>
    </main>
  )
}
