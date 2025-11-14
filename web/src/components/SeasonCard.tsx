import { Link } from "react-router";
import TimeAgo from "./TimeAgo";
import TimeUntil from "./TimeUntil";
import Trophy from "./Trophy";
import { SeasonSummary } from "../domain/season";
import { EventStatus } from "../domain/event";
import { useMemo } from "react";

interface SeasonCardProps {
  season: SeasonSummary;
  canManage?: boolean;
}

const formatEventLabel = (status: EventStatus) => {
  switch (status) {
    case EventStatus.Live:
      return "Live";
    case EventStatus.New:
      return "Upcoming";
    case EventStatus.Over:
      return "Completed";
    default:
      return "Event";
  }
};

export default function SeasonCard({ season, canManage = false }: SeasonCardProps) {
  const upcomingSchedule = useMemo(() => {
    const now = Date.now();
    return season.schedule.events
      .filter(ev => new Date(ev.startAt).getTime() >= now)
      .slice(0, 3);
  }, [season.schedule.events]);

  return (
    <article className={`season-card ${season.isActive ? "active" : "archived"}`}>
      <header className="season-card-header">
        <div>
          <h3>{season.name}</h3>
          <p className="season-pitch">{season.pitch}</p>
        </div>
        <div className="season-meta">
          <span className="season-mode">{season.mode}</span>
          <span className="season-hours">{season.hours.toFixed(0)}h avg</span>
        </div>
      </header>

      <section className="season-highlight">
        {season.upcomingEvent ? (
          <div className="season-event upcoming">
            <Trophy />
            <div>
              <strong>Next: {season.upcomingEvent.name}</strong>
              <div>
                <span>{formatEventLabel(season.upcomingEvent.status)} in </span>
                <TimeUntil targetTime={new Date(season.upcomingEvent.startAt)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="season-event muted">No upcoming event scheduled</div>
        )}

        {season.latestEvent && (
          <div className="season-event latest">
            <Trophy />
            <div>
              <strong>Latest: {season.latestEvent.name}</strong>
              <div>Ended <TimeAgo targetTime={new Date(season.latestEvent.endAt)} /> ago</div>
            </div>
          </div>
        )}
      </section>

      {upcomingSchedule.length > 0 && (
        <section className="season-schedule-preview">
          <h4>Schedule</h4>
          <ol>
            {upcomingSchedule.map(ev => (
              <li key={`${season.code}-${ev.eventNum}`}>
                <span>#{ev.eventNum}</span>
                <span>{ev.name || `Event ${ev.eventNum}`}</span>
                <span>{new Date(ev.startAt).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="season-card-footer">
        <div>
          <small>{season.eventCount} total events</small>
        </div>
        {canManage && (
          <Link to={`/series/${season.code}/edit`} className="manage-link">Manage</Link>
        )}
      </footer>
    </article>
  );
}
