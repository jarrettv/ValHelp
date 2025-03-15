import React from 'react';
import { Player } from '../domain/event';
import "./PlayerRow.css";
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';
import { useAuth } from '../contexts/AuthContext';
import Watch from './Watch';
import { Link } from 'react-router';

interface PlayerLogsRowProps {
  player: Player;
}

const PlayerLogsRow: React.FC<PlayerLogsRowProps> = ({ player }) => {
  const { status } = useAuth();
  const playerStatus = status?.id === player.userId ? "active" : "normal";

  if (player.status < 0) { return <></>; }

  return (
    <div className={`player-row ${playerStatus}`}>
      <div className="player-info">
        <img src={player.avatarUrl} alt={player.name} className="player-avatar" />
        <div className="player-name">
          <Link to={`/players/${player.userId}`}>{player.name}</Link>
          {player.stream.length > 5 && <div style={{fontSize:'smaller'}}><a href={player.stream} target="_blank"><Watch width="30" height="30" style={{ color:"#5b6eae", verticalAlign: "middle", margin:'0 0.7rem' }} />Watch</a></div>}
        </div>
        <div className="player-score">{player.score}</div>
      </div>
      <div className="player-logs">
        {player.logs
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        .map((log, index) =>
          log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> :
            log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> : null
        )}
      </div>
    </div>
  );
};

export default PlayerLogsRow;