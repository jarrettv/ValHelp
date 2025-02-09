import { Link, useParams } from "react-router";
import { useActiveEvent, usePlayers } from "./hooks/useEvent";
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
import { Event as Ev, EventStatus } from "./domain/event";

export default function Event() {
  const { id } = useParams();
  var { data, isPending } = useActiveEvent(parseInt(id!));
  var { data: players } = usePlayers(parseInt(id!));
  const { status } = useAuth();

  return (<>
    {isPending && <div><Spinner /></div>}
    {!isPending && data && (

      <div className={data.status === EventStatus.Live ? "competition live" : "competition"}>
        { data.isOwner && <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div>
        
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
        
        {data.status === EventStatus.New && <Register eventId={data.id} player={(players ?? []).find(x => x.userId === status?.id)} />}

        <EventStandings players={players ?? []} eventStatus={data.status} />

        {players?.length === 0 && <div className="card">No players yet</div>}
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
  const calcState = (ev: Ev) => {
    if (ev.status === EventStatus.Draft) return "draft";

    const random = ev.seed === "(random)";
    const soon = (new Date(ev.startAt).getTime() - new Date().getTime()) < 1000 * 60 * 60;
    const lessThan5m = (new Date(ev.startAt).getTime() - new Date().getTime()) < 1000 * 60 * 5;

    if (ev.status === EventStatus.New && soon && !random && lessThan5m) return "seed";
    if (ev.status === EventStatus.New && soon && random) return "rand";
    if (ev.status === EventStatus.New && soon) return "soon";
    if (ev.status === EventStatus.New) return "new";

    if (ev.status === EventStatus.Live) return "live";
    if (ev.status === EventStatus.Over) return "over";

    return "old";
  }
  const state = calcState(event);

  return (
    <>
      {state === "draft" && <div className="status info">Draft events aren't visible until you mark them ready</div>}
      {state === "seed" && <div className="status active">✨ Starting soon ✨ Seed is {event.seed}</div>}
      {state === "rand" && <div className="status active">✨ Starting soon ✨ Seed roll in <TimeUntil targetTime={new Date(new Date(event.startAt).getTime() - 1000 * 60 * 5)} /> ✨</div>}
      {state === "seed" && <div className="status active">✨ Starting in {event.seed} ✨</div>}
      {state === "live" && <div className="status active">LIVE for another <TimeUntil targetTime={new Date(event.endAt)} /></div>}
      {state === "new" && <div className="status info">Event doesn't start for another <TimeUntil targetTime={new Date(event.endAt)} /></div>}
      {state === "over" && <div className="status info">Ended <TimeAgo targetTime={new Date(event.endAt)} /> ago</div>}
      {state === "old" && <div className="status info">Event ended a long time ago</div>}
    </>
  );
}