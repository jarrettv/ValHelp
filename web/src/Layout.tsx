import { Outlet } from 'react-router'

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
          <a href="/auth/login" id="user-login" style={{margin:"0.5rem 0 0 1rem"}}>Login</a>
        </div>
      </header>
      <article>
        <Outlet />
      </article>
    </main>
  )
}
