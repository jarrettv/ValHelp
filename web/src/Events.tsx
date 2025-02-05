import EventPreview from "./components/EventPreview";
import EventHighlight from "./components/EventHighlight";
import "./Home.css"
import { EventStatus, useEvents } from "./hooks/useEvents";


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
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .map(event => (
        <>
        { event.status < EventStatus.Live && <EventPreview key={event.id} event={event} /> }
        { event.status >= EventStatus.Live && <EventHighlight key={event.id} event={event} /> }

        </>
      ))}
      {data.data.length === 0 && <section className="competition empty">No upcoming events</section>}
    </div>
  );
};