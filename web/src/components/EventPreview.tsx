import { Link } from "react-router";
import Trophy from "./Trophy";
import { EventRow } from "../hooks/useEvents";
import { useEffect, useState } from "react";

interface EventPreviewProps {
  event: EventRow;
}

export default function EventPreview({ event }: EventPreviewProps) {
  const [isStartingSoon, setIsStartingSoon] = useState(false);

  useEffect(() => {
    const startAt = new Date(event.startAt);
    const now = new Date();
    const diff = startAt.getTime() - now.getTime();
    setIsStartingSoon(diff < 1000 * 60 * 60);
  }, [event.startAt]);
  
  return (
    <div className="competition">
      <div style={{ display: "flex" }}>
        <Trophy />
        <div className="competition-info">
          <h3>{event.name} <small>by {event.createdBy}</small></h3>
          <div className="timing">{new Date(event.startAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} {new Date(event.startAt).toLocaleTimeString().replace(':00:00 ', '').toLowerCase()}-{new Date(event.endAt).toLocaleTimeString().replace(':00:00 ', '').toLowerCase()}</div>
        </div>
        <Link to={`/events/${event.id}`}>View</Link>
      </div>
      {isStartingSoon && <div className="status active">✨ Starting soon ✨</div>}
      <div style={{ display: "flex", alignItems: "center", margin: "0.3rem 0 0 3rem" }}>
        {event.players.map(player => (
          <img
            key={player.id}
            src={player.avatarUrl}
            alt={player.name}
            title={player.name}
            style={{ width: "2rem", height: "2rem", borderRadius: "50%", marginLeft: "-0.5rem", border: "2px solid white" }}
          />
        ))}
      </div>
    </div>
  );
}