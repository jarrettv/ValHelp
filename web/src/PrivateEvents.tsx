import EventPreview from "./components/EventPreview";
import EventHighlight from "./components/EventHighlight";
import "./Events.css"
import { usePrivateEvents, EventRow } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";

export default function PrivateEvents() {
  const { data, isError, isPending } = usePrivateEvents();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Problem loading private events</div>;
  }

  return (
    <div>
      {data.data
        .sort((a: EventRow, b: EventRow) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
        .map((event: EventRow) => (
          <div key={event.id}>
            {event.status < EventStatus.Live && <EventPreview event={event} />}
            {event.status >= EventStatus.Live && <EventHighlight event={event} />}
          </div>
        ))}
      {data.data.length === 0 && <section className="competition empty">No private events</section>}
    </div>
  );
} 