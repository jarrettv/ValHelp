import React from 'react';
import { Player } from '../domain/event';
import "./PlayerRow.css";
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';
import { useAuth } from '../contexts/AuthContext';
import Youtube from './Youtube';
import Twitch from './Twitch';
import Watch from './Watch';
import { Link } from 'react-router';

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
        <Link to={`/players/${player.userId}`} className="player-name">{player.name}</Link>
        {mode === "logs" && <div className="player-score">{player.score}</div>}
      </div>
      {mode === "info" && <div className="player-info">
        {player.logs.filter(log => log.code.startsWith("Stream")).map((log) => (
          <div key={log.code} style={{fontSize:'0.8rem'}}>
            {log.code.startsWith("StreamYoutube") && <a href={log.code.split('=')[1].split(',')[1]} target="_blank"><Youtube width="30" height="30" style={{ verticalAlign: "middle", margin:'0 0.3rem' }} /><span>{log.code.split('=')[1].split(',')[0]}</span></a>}
            {log.code.startsWith("StreamTwitch") && <a href={log.code.split('=')[1].split(',')[1]} target="_blank"><Twitch width="30" height="30" style={{ verticalAlign: "middle", margin:'0 0.3rem' }} /><span>{log.code.split('=')[1].split(',')[0]}</span></a>}
          </div>
        ))}
        {player.logs.filter(log => log.code.startsWith("Stream")).length === 0 && player.stream.length > 5 && <a href={player.stream} target="_blank"><Watch width="30" height="30" style={{ color:"#5b6eae", verticalAlign: "middle", margin:'0 0.7rem' }} />Watch</a>}
      </div>}
      {mode === "logs" && <div className="player-logs">
        {player.logs
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        .map((log, index) =>
          log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> :
            log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> : null
        )}
      </div>}
    </div>
  );
};

export default PlayerRow;