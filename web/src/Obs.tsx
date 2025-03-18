import ObsOverviewEdit from "./components/ObsOverviewEdit";
import ObsScoreEdit from "./components/ObsScoreEdit";
import ObsScoresEdit from "./components/ObsScoresEdit";
import { useAuth } from "./contexts/AuthContext";
import { Event as Ev } from "./domain/event";

export default function Obs() {
  const { status } = useAuth();

  if (!status?.isActive) {
    return (
      <div className="card" style={{ marginTop: ".8rem" }}>
        <div className="register-info">Please login to proceed</div>
      </div>
    );
  }

  return (
    <section id="obs-tools">
      <div className="card">
        <p><img style={{float:'left',margin:'0.4rem 1rem 1rem 0'}} width="32" height="32" src="https://obsproject.com/assets/images/new_icon_small-r.png" alt="obs" /> Oden wants your viewers to be happy. Use and customize the following browser sources to enhance your OBS overlay.</p>

        <p>Each URL contains your player ID that we then redirect to the most relevant current event. This way you don't have to keep updating your browser source for each broadcast.</p>
        
        <p>For example:<br/>
        <code style={{color:'gold'}}>https://valheim.help/api/obs/score/{status.id}</code>
        <br/>may automatically map to event 100<br/>
        <code style={{color:'gold'}}>https://valheim.help/events/100/score/{status.id}</code></p>

        <p>This screen allows you to customize the colors and settings which are added onto the URL as the querystring.</p>
      </div>
      <br/>
      <ObsScoreEdit avatarUrl={status.avatarUrl} name={status.username} playerId={status.id} />
      <br/>
      <ObsScoresEdit event={{} as Ev} playerId={status.id} />
      <br/>
      <ObsOverviewEdit event={{} as Ev} playerId={status.id} />
    </section>
  )
}