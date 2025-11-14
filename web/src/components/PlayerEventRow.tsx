import React from 'react';
import { PlayerEvent } from '../domain/player';
import Trophy from './Trophy';
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';
import Watch from './Watch';
import { PlayerBonus } from './PlayerBonus';

interface PlayerEventRowProps {
  player: PlayerEvent;
  mode: "info" | "logs";
}

const PlayerEventRow: React.FC<PlayerEventRowProps> = ({ player, mode }) => {
    const place = player.scores.sort((a,b) => b - a).findIndex(score => score === player.score) + 1;
  return (
    <div className={`player-row`}>
          <div className="player-info">
            <div style={{display:'flex', alignItems:'center', flexDirection:'column'}}>
            <Trophy width="30" height="30" style={{ verticalAlign: "middle", margin:'0 0.3rem' }} />
            {place <= 3 && <div className="player-place">{place}<span>{getPlaceSuffix(place)}</span></div>}
            </div>
            <div>
                <div className="event-name">{player.eventName}</div>
                <div className="event-hours">
                    
          {player.stream.length > 5 && <a style={{fontSize:'0.8rem'}} href={player.stream} target="_blank"><Watch width="20" height="20" style={{ color:"#5b6eae", verticalAlign: "middle", margin:'0 0.3rem' }} />watch {player.hours}h live event</a>}
          
                    {player.stream.length < 5 && <div>{player.hours}h event</div>}
                    
                </div>
            </div>
            {mode === "logs" && <div className="player-score">{player.score}</div>}
          </div>
          <div className="player-logs">
            {player.logs
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
            .map((log, index) =>
              log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> :
              log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> :
              log.code.startsWith("Bonus") ? <PlayerBonus key={index} code={log.code} /> : null
            )}
          </div>
        </div>
    );
}

const getPlaceSuffix = (place: number) => {
    if (place === 1) return 'st';
    if (place === 2) return 'nd';
    if (place === 3) return 'rd';
    return 'th';
  };
export default PlayerEventRow;