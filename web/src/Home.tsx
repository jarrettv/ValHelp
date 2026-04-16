import "./Home.css"
import EventLatest from "./components/EventsLatest";
import EventsUpcoming from "./components/EventsUpcoming";


export default function Home() {
  return (
    <div className="home-events">
      <section>
        <h2>Latest Events</h2>
        <EventLatest />
      </section>
      <section>
        <h2>Upcoming Events</h2>
        <EventsUpcoming />
      </section>
    </div>
  )
}
