import React from 'react';
import { Player } from '../domain/event';
import "./PlayerRow.css";
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';
import { useAuth } from '../contexts/AuthContext';
import Youtube from './Youtube';
import Twitch from './Twitch';

interface PlayerRowProps {
  player: Player;
  mode: "info" | "logs" ;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, mode }) => {
  const { status } = useAuth();
  const playerStatus = status?.id === player.userId ? "active" : "normal";

  if (player.status < 0) { return <></>; }

  return (
    <div className={`player-row ${playerStatus}`}>
      <div className="player-info">
        <img src={player.avatarUrl} alt={player.name} className="player-avatar" />
        {player.stream.length > 5 && <div className="player-name"><a title="Watch Stream" href={player.stream} target="_blank">{player.name}</a></div> }
        {player.stream.length <= 5 && <div className="player-name">{player.name}</div> }
        {mode === "logs" && <div className="player-score">{player.score}</div>}
      </div>
      {mode === "info" && <div className="player-info">
        {player.logs.filter(log => log.code.startsWith("Stream")).map((log) => (
          <div key={log.code} style={{fontSize:'0.8rem'}}>
            {log.code.startsWith("StreamYoutube") && <a href={log.code.split('=')[1].split(',')[1]} target="_blank"><Youtube width="30" height="30" style={{ verticalAlign: "middle", marginRight:'0.2rem' }} />{log.code.split('=')[1].split(',')[0]}</a>}
            {log.code.startsWith("StreamTwitch") && <a href={log.code.split('=')[1].split(',')[1]} target="_blank"><Twitch width="30" height="30" style={{ verticalAlign: "middle", marginRight:'0.2rem' }} />{log.code.split('=')[1].split(',')[0]}</a>}
          </div>
        ))}
        {player.logs.filter(log => log.code.startsWith("Stream")).length === 0 && player.stream.length > 5 && <a href={player.stream} target="_blank">Watch Stream</a>}
      </div>}
      {mode === "logs" && <div className="player-logs">
        {player.logs.map((log, index) =>
          log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> :
            log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> : null
        )}
      </div>}
    </div>
  );
};

export default PlayerRow;