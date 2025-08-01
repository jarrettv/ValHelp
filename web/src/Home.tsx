import "./Home.css"
import Badge from "./components/Badge";
import Calendar from "./components/Calendar";
import EventLatest from "./components/EventsLatest";
import EventsUpcoming from "./components/EventsUpcoming";
import Lock from "./components/Lock";
import { Link } from "react-router";
import { useAuth } from "./contexts/AuthContext";
import Leaderboard from "./components/Leaderboard";


export default function Home() {
  const { status } = useAuth();
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
        { status?.isActive &&
        <Link to="/events/0/edit">
          <Calendar style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Host Event <small>Public or Private</small>
        </Link> }
        <Link to="/events/all">
          <Badge style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          All Events <small>Current and Historic</small>
        </Link>
        { status?.isActive &&
        <Link to="/events/private">
          <Lock style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Private Events <small>For Me and Friends</small>
        </Link> }
        <Link to="/leaderboard">
          <Leaderboard style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Player Leaderboard <small>All Events</small>
        </Link>
        {/* <a href="/gear">
          <Swords style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Gear <small>Weapons &amp; Armor Info</small>
        </a>
        <a href="/food">
          <Food style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Food <small>Recipes &amp; Stats</small>
        </a> */}
      </nav>
    </>
  )
}