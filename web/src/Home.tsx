import Food from "./components/Food";
import Swords from "./components/Swords";
import "./Home.css"
import Badge from "./components/Badge";
import Calendar from "./components/Calendar";
import EventLatest from "./components/EventsLatest";
import EventsUpcoming from "./components/EventsUpcoming";
import { Link } from "react-router";


export default function Home() {
  return (
    <>
      <section style={{margin: "0 auto", display:"flex", flexWrap: "wrap", justifyContent: "space-around", maxWidth: "1000px"}}>
        <div style={{marginRight: "1rem"}}>
          <h2>Latest Events</h2>
          <EventLatest />
        </div>
        <div>
          <h2>Upcoming Events</h2>
          <EventsUpcoming />
        </div>
      </section>
      <nav>
        <Link to="/events/host">
          <Calendar style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Host Event <small>Open or Private</small>
        </Link>
        <a href="/trophy/tracker">
          <Badge style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          High Scores <small>PB Tracking</small>
        </a>
        <a href="/gear">
          <Swords style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Gear <small>Weapons &amp; Armor Info</small>
        </a>
        <a href="/food">
          <Food style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Food <small>Recipes &amp; Stats</small>
        </a>
      </nav>
    </>
  )
}