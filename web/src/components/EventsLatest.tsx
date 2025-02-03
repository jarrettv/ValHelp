import EventHighlight from './EventHighlight';
import { useEventsLatest } from '../hooks/useEvents';

export default function EventsLatest() {
  const { data, isError, isPending } = useEventsLatest();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Problem loading latest events</div>;
  }

  return (
    <div>
      {data.data.map(event => (
        <EventHighlight key={event.id} event={event} />
      ))}
      {data.data.length === 0 && <section className="competition empty">No recent events</section>}
    </div>
  );
};
