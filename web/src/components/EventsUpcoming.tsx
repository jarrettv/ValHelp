import { useEventsUpcoming } from '../hooks/useEvents';
import EventPreview from './EventPreview';

export default function EventsLatest() {
  const { data, isError, isPending } = useEventsUpcoming();

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
        <EventPreview key={event.id} event={event} />
      ))}
      {data.data.length === 0 && <section className="competition empty">No upcoming events</section>}
    </div>
  );
};
