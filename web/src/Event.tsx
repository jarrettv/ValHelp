import { useParams } from "react-router";
import { useActiveEvent } from "./hooks/useEvent";
import Spinner from "./components/Spinner";
import Trophy from "./components/Trophy";
import TimeUntil from "./components/TimeUntil";
import TimeAgo from "./components/TimeAgo";
import { EventStatus } from "./hooks/useEvents";
import getFriendlyDateRange from "./utils/date";
import React from "react";
import { Scoring } from "./components/Scoring";

export default function Event() {
  const { id } = useParams();
  var { data, isPending } = useActiveEvent(parseInt(id!));
  return (<>
    {isPending && <div><Spinner /></div>}
    {!isPending && data && (

      <div className="competition">
        <div style={{ display: "flex" }}>
          <Trophy />
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
            
        {data.status === EventStatus.Live && <div className="status active">LIVE for another <TimeUntil targetTime={new Date(data.endAt)} />, data will refresh periodically</div>}
        {data.status >= EventStatus.Over && <div className="status">Ended <TimeAgo targetTime={new Date(data.endAt)} /> ago</div>}
        <div>          
          {/* {data.players
            .sort((a, b) => b.score - a.score)
            .map((player, index) => (
              <HuntPlacement
                key={player.name}
                placeNumber={index + 1}
                playerAvatar={player.avatarUrl}
                playerName={player.name}
                score={player.score}
              />
            ))} */}
        </div>
        {/* {data.players.length === 0 && <div className="card">No players yet</div>} */}
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