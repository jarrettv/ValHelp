import { Link, useParams } from "react-router";
import { useActiveEvent, usePlayers } from "./hooks/useEvent";
import Spinner from "./components/Spinner";
import Trophy from "./components/Trophy";
import TimeUntil from "./components/TimeUntil";
import TimeAgo from "./components/TimeAgo";
import getFriendlyDateRange from "./utils/date";
import React from "react";
import { Scoring } from "./components/Scoring";
import PlayerStandings from "./components/EventStandings";
import { useAuth } from "./contexts/AuthContext";
import Register from "./components/Register";
import { EventStatus } from "./domain/event";

export default function Event() {
  const { id } = useParams();
  var { data, isPending } = useActiveEvent(parseInt(id!));
  var { data: players } = usePlayers(parseInt(id!));
  const { status } = useAuth();


  return (<>
    {isPending && <div><Spinner /></div>}
    {!isPending && data && (

      <div className="competition">
        { data.isOwner && <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div>
        
        <Link style={{margin:"0"}} to={`/events/${id}/edit`}>Edit</Link>
        </div>}
        <div style={{ display: "flex" }}>
          <Trophy style={{opacity:data.status === EventStatus.Draft ? 0.2 : 1}} />
          <div className="competition-info">
            <h3 style={{fontSize:"1.5rem"}}>{data.name}</h3>
            <div className="timing">
              {getFriendlyDateRange(new Date(data.startAt), new Date(data.endAt))}
            </div>            
          </div>
          <div className="seed">
            <div style={{opacity:0.6}}>Seed</div>
            <div style={{marginTop:"-0.3rem"}}>{data.seed}</div>
          </div>
        </div>
        {data.status === EventStatus.Draft && <div className="status info">Draft events aren't visible until you mark them ready</div>}
        {data.status === EventStatus.New && ((new Date(data.startAt).getTime() - new Date().getTime()) < 1000 * 60 * 60) && <div className="status active">✨ Starting soon ✨</div>}
        {data.status === EventStatus.Live && <div className="status active">LIVE for another <TimeUntil targetTime={new Date(data.endAt)} />, data will refresh periodically</div>}
        {data.status >= EventStatus.Over && <div className="status">Ended <TimeAgo targetTime={new Date(data.endAt)} /> ago</div>}

        {data.status === EventStatus.New && <Register eventId={data.id} player={(players ?? []).find(x => x.userId === status?.id)} />}
        <div className={data.status === EventStatus.Live ? "player-standings live" : "player-standings"}>
            <PlayerStandings players={players ?? []} eventStatus={data.status} />
        </div>
        
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