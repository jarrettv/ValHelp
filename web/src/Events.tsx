import EventPreview from "./components/EventPreview";
import EventHighlight from "./components/EventHighlight";
import "./Home.css"
import { useEvents } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";


export default function Events() {
  const { data, isError, isPending } = useEvents();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Problem loading upcoming events</div>;
  }

  return (
    <div>
      {data.data
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
      .map(event => (
        <div key={event.id}>
        { event.status < EventStatus.Live && <EventPreview event={event} /> }
        { event.status >= EventStatus.Live && <EventHighlight event={event} /> }

        </div>
      ))}
      {data.data.length === 0 && <section className="competition empty">No events</section>}
    </div>
  );
};