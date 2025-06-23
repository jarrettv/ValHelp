import { Link } from "react-router";
import HuntPlacement from "./HuntPlacement";
import Trophy from "./Trophy";
import TimeUntil from "./TimeUntil";
import TimeAgo from "./TimeAgo";
import { EventRow } from "../hooks/useEvents";
import { EventStatus } from "../domain/event";

interface EventHighlightProps {
  event: EventRow;
}

export default function EventHighlight({ event }: EventHighlightProps) {

  const getEventHours = () => {
    const startAt = new Date(event.startAt);
    const endAt = new Date(event.endAt);
    return Math.round((endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60)) + "h event";
  };

  return (
    <div className="competition row">
      <div style={{ display: "flex" }}>
        <Trophy private={event.isPrivate} />
        <div className="competition-info">
          <h3>{event.name} <small>{getEventHours()}</small></h3>
          <div className="timing">
            { event.status === EventStatus.Live && <span style={{color:'gold'}}>LIVE for another <TimeUntil targetTime={new Date(event.endAt)} /></span> }
            { event.status >= EventStatus.Over && <>Ended <TimeAgo targetTime={new Date(event.endAt)} /> ago</> }
          </div>
        </div>
        <Link to={`/events/${event.id}`}>View</Link>
      </div>
      <div>
        {event.players
          .slice()
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((player, index) => (
          <HuntPlacement
            key={player.name}
            placeNumber={index + 1}
            playerAvatar={player.avatarUrl}
            playerName={player.name}
            score={player.score}
          />
        ))}
      </div>
    </div>
  );
}