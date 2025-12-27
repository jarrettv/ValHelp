import "./Obs.css";
import { Event } from '../domain/event';

interface ObsScoresProps {
  playerId: number;
  event: Event;
  bg?: string;
  title?: string;
  score?: string;
  active?: string;
  bubble?: string;
  max?: number;
  hideTitle: boolean;
}

export default function ObsScores(props: ObsScoresProps) {
  const player = props.event.players.find(player => player.userId === props.playerId);
  if (!player) {
    return 'No player';
  }

  let topPlayers = props.event.players
    .filter(x => x.status >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, props.max ?? 6);
  if (!topPlayers.find(player => player.userId === props.playerId)) {
    topPlayers.pop();
    topPlayers.push(player);
  }

  return (
    <div className="obs-leaderboard" style={{ backgroundColor: props.bg ?? 'transparent' }}>
      {/* <div className="obs-text">
        { status === "pre" && <Countdown targetTime={new Date(props.event.startAt)} color={ props.pre ?? '#fff9' } message="START"/> }
        { status === "live" && <Countdown targetTime={new Date(props.event.endAt)} color={ props.live ?? '#72da83' } message="OVER" /> }
        { status === "post" && <div className="num countdown over" style={{color: props.post ?? '#9fd2ff'}}><small>{props.event.hours}h&#160;</small>FINAL</div>}
      </div> */}
      {!props.hideTitle && <div className="obs-title" style={{ color: props.title ?? '#fff', textAlign: 'left' }}>
        {props.event.name.replace('Trophy ', '').replace('Event ', '').replace('Trailblazer', 'Blazer').replace('Charity', '💝').replace('# ', '#').substring(0, 13)}
      </div>
      }
      {topPlayers.map((player) => (
        <div key={player.userId} className="obs-player" style={{ backgroundColor: player.userId != props.playerId ? 'transparent' : props.bubble ?? '#fff6'}}>
          <div className="obs-avatar">
            <img src={player.avatarUrl} alt={`${player.userId}`} />
          </div>
          <div className="obs-text">
            {props.playerId != player.userId && <div className="num score" style={{ color: props.score ?? '#fcc400' }}>{player.score}</div>}
            {props.playerId == player.userId && <div className="num score" style={{ color: props.active ?? '#fe9200' }}>{player.score}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}