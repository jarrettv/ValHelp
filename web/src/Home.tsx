import "./Home.css"
import EventLatest from "./components/EventsLatest";
import EventsUpcoming from "./components/EventsUpcoming";
import HomeGuidesCard from "./components/HomeGuidesCard";
import SEO from "./components/SEO";


export default function Home() {
  return (
    <div className="home-events">
      <SEO
        title="Valheim Help"
        description="Ad-free Valheim info and tools. Trophy hunt tracking, speedrun leaderboards, boss guides, and game reference for the Valheim community."
        path="/"
      />
      <section>
        <h2>Latest Events</h2>
        <EventLatest />
      </section>
      <section>
        <h2>Upcoming Events</h2>
        <EventsUpcoming />
        <h2>Guides</h2>
        <HomeGuidesCard />
      </section>
    </div>
  )
}
