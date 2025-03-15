import { Link, useParams } from "react-router";
import { useEvent } from "./hooks/useEvent";
import Spinner from "./components/Spinner";
import Trophy from "./components/Trophy";
import TimeUntil from "./components/TimeUntil";
import TimeAgo from "./components/TimeAgo";
import { getFriendlyDateRange, getShortDateRange } from "./utils/date";
import React from "react";
import { Scoring } from "./components/Scoring";
import EventStandings from "./components/EventStandings";
import { useAuth } from "./contexts/AuthContext";
import Register from "./components/Register";
import { Event as Ev, EventStatus, GetEventState } from "./domain/event";
import EventPlayers from "./components/EventPlayers";

export default function Event() {
  const { id } = useParams();
  var { data, isPending } = useEvent(parseInt(id!));
  const { status } = useAuth();

  return (<>
    {isPending && <div><Spinner /></div>}
    {!isPending && data && (

      <div className={data.status === EventStatus.Live ? "competition live" : "competition"}>
        { data.players.find(x => x.userId == status?.id) && <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div>
        
        <Link style={{margin:"0"}} to={`/events/${id}/edit`}>Edit</Link>
        </div>}
        <div style={{ display: "flex" }}>
          <Trophy style={{opacity:data.status === EventStatus.Draft ? 0.2 : 1}} />
          <div className="competition-info">
            <h3 style={{fontSize:"1.5rem"}}>{data.name}</h3>
            <div className="timing wide">
              {getFriendlyDateRange(new Date(data.startAt), new Date(data.endAt))}
            </div>
            <div className="timing mobile">
              {getShortDateRange(new Date(data.startAt), new Date(data.endAt))}
            </div>
          </div>
          <div className="seed">
            <div style={{opacity:0.6}}>Seed</div>
            <div style={{marginTop:"-0.3rem"}}>{data.seed}</div>
          </div>
        </div>
        <EventStatusArea event={data} />
        
        {data.status === EventStatus.New && <Register eventId={data.id} player={data.players.find(x => x.userId === status?.id)} />}

        {data.status < EventStatus.Live && <EventPlayers players={data.players} /> }
        {data.status >= EventStatus.Live && <EventStandings players={data.players} /> }

        {data.players.length === 0 && <div className="card">No players yet</div>}
        <p>
          {data.desc.split('\n').map((item, idx) => (
            <React.Fragment key={idx}>
              {item}
              <br />
            </React.Fragment>
          ))}
        </p>
        <Scoring scoring={data.scoring} />

      </div>
    )}
  </>
  );
}

function EventStatusArea({ event }: { event: Ev}) {


  const [state, setState] = React.useState(GetEventState(event));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setState(GetEventState(event));
    }, 1000);

    return () => clearInterval(interval);
  }, [event]);

  return (
    <>
      {state === "draft" && <div className="status info">Draft events aren't visible until you mark them ready</div>}
      {state === "wait" && <div className="status info">Event scheduled <TimeUntil targetTime={new Date(event.startAt)} /> from now</div>}
      {state === "rand" && <div className="status active">✨ Seed will roll in <TimeUntil targetTime={new Date(new Date(event.startAt).getTime() - 1000 * 60 * 5)} /> ✨</div>}
      {state === "roll" && <div className="status active">✨ Rolling a random seed... ✨</div>}
      {state === "seed" && <div className="status active">✨ Seed available, starting in <TimeUntil targetTime={new Date(event.startAt)} /> ✨</div>}
      {state === "soon" && <div className="status active">✨ Starting in <TimeUntil targetTime={new Date(event.startAt)} /> ✨</div>}
      {state === "start" && <div className="status active">✨ Starting NOW ✨</div>}
      {state === "live" && <div className="status active">LIVE for another <TimeUntil targetTime={new Date(event.endAt)} /></div>}
      {state === "over" && <div className="status info">Event ended <TimeAgo targetTime={new Date(event.endAt)} /> ago</div>}
      {state === "old" && <div className="status info">Event ended a long time ago</div>}
    </>
  );
}