import { Link } from 'react-router';

// /privacy: the privacy policy for the site and ValHelp Tracker (linked from the
// tracker's About box and its Microsoft Store listing). Keep it in step with what
// the API stores and with the tracker's safety report on /tracker.

const UPDATED = '2026-11-14';
const ISSUES = 'https://github.com/jarrettv/ValHelp/issues';

export default function Privacy() {
  return (
    <section style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ margin: '1.5rem 0' }}>
        <h1>Privacy policy</h1>
        <p><em>Last updated {UPDATED}</em></p>

        <p>
          Valheim Help (valheim.help) and the ValHelp Tracker app are a free, open-source fan
          project. We collect as little as we can, we don't sell or share your data, and we
          don't show ads or use third-party trackers.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account.</strong> When you sign in with Discord we receive your Discord
            id, username, avatar and email address. Anything you add to your profile (such as
            YouTube, Twitch or Steam names) is stored with it.
          </li>
          <li>
            <strong>Events and scores.</strong> What you enter for events, and your results,
            are shown publicly on the site.
          </li>
          <li>
            <strong>Feedback</strong> you send through the site, linked to your account.
          </li>
          <li>
            <strong>Usage counts</strong> on the Worlds pages (seeds opened, zoom, which map
            markers are clicked, device type). These use a random id per browser tab; we don't
            keep IP addresses with them.
          </li>
        </ul>

        <h2>ValHelp Tracker</h2>
        <p>The tracker only does anything after you link it to your account and tick a character. Then it sends:</p>
        <ul>
          <li>the save file (.fch) of each character you ticked, including its older backups;</li>
          <li>the small world files (.fwl / .fwl2 and the minimap metadata) and the first 12 bytes of world saves, so we can tell which seed and in-game day each save belongs to;</li>
          <li>your PC's name when you link it, so you can tell your devices apart.</li>
        </ul>
        <p>
          It never sends characters you didn't tick or any other files, and it never changes
          your saves. Runs built from tracked characters are shown publicly on the site under
          your name. See the <Link to="/tracker">tracker page</Link> for a full safety report
          and the source code.
        </p>

        <h2>Cookies and storage</h2>
        <p>
          We use one cookie to keep you signed in. Your browser also remembers a few display
          settings (like open panels) on your own device. No advertising or analytics cookies.
        </p>

        <h2>Where it's kept</h2>
        <p>
          The site runs on Microsoft Azure and its database is hosted by Supabase. Like any web
          server, our hosting may briefly log requests (including IP addresses) for security
          and troubleshooting.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Untick a character or choose <em>Unlink this PC</em> in the tracker to stop uploads. You can also remove a PC from your devices on the site.</li>
          <li>
            To have your account, characters or other data deleted, send a request through the
            site's feedback form while signed in, or <a href={ISSUES}>open an issue on GitHub</a>.
            We'll delete it within 30 days.
          </li>
        </ul>

        <h2>Children</h2>
        <p>The site isn't aimed at children under 13, and we don't knowingly collect their data.</p>

        <h2>Changes</h2>
        <p>
          If this policy changes we'll update the date above. Questions? <a href={ISSUES}>Ask on GitHub</a>.
        </p>
      </div>
    </section>
  );
}
