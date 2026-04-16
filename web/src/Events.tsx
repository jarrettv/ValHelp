import { Link, useParams } from "react-router";
import EventPreview from "./components/EventPreview";
import EventHighlight from "./components/EventHighlight";
import CategorySideNav from "./components/CategorySideNav";
import { EVENT_TYPES, findEventType } from "./components/eventCategories";
import "./Events.css"
import "./components/CategoryLayout.css";
import { useEvents } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";

export default function Events() {
  const { category: categorySlug } = useParams<{ category?: string }>();
  const type = findEventType(categorySlug);
  const { data, isError, isPending } = useEvents();

  const events = data?.data ?? [];
  const filtered = type ? events.filter(e => e.mode === type.mode) : events;
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
  );

  return (
    <div className="category-layout">
      <CategorySideNav
        basePath="/events/all"
        categories={EVENT_TYPES}
        showPrivate
        showHostEvent
      />
      <div className="content">
        {type?.slug === "saga" && (
          <div className="guide-banner">
            📖 New to Saga? Read the <Link to="/guides/info/trophy-saga">Trophy Saga guide</Link>.
          </div>
        )}
        {isPending && <div>Loading...</div>}
        {isError && <div>Problem loading upcoming events</div>}
        {!isPending && !isError && (
          <div>
            {sorted.map(event => (
              <div key={event.id}>
                {event.status < EventStatus.Live && <EventPreview event={event} />}
                {event.status >= EventStatus.Live && <EventHighlight event={event} />}
              </div>
            ))}
            {sorted.length === 0 && <section className="competition empty">No events</section>}
          </div>
        )}
      </div>
    </div>
  );
};
