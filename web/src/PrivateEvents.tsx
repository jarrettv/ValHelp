import EventPreview from "./components/EventPreview";
import EventHighlight from "./components/EventHighlight";
import CategorySideNav from "./components/CategorySideNav";
import { EVENT_TYPES } from "./components/eventCategories";
import "./Events.css"
import "./components/CategoryLayout.css";
import { usePrivateEvents, EventRow } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";

export default function PrivateEvents() {
  const { data, isError, isPending } = usePrivateEvents();

  const events: EventRow[] = data?.data ?? [];
  const sorted = [...events].sort(
    (a: EventRow, b: EventRow) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
  );

  return (
    <div className="category-layout">
      <CategorySideNav basePath="/events/all" categories={EVENT_TYPES} showPrivate showHostEvent />
      <div className="content">
        {isPending && <div>Loading...</div>}
        {isError && <div>Problem loading private events</div>}
        {!isPending && !isError && (
          <div>
            {sorted.map((event: EventRow) => (
              <div key={event.id}>
                {event.status < EventStatus.Live && <EventPreview event={event} />}
                {event.status >= EventStatus.Live && <EventHighlight event={event} />}
              </div>
            ))}
            {sorted.length === 0 && <section className="competition empty">No private events</section>}
          </div>
        )}
      </div>
    </div>
  );
}
