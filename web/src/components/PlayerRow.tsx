import React from 'react';
import { Player } from '../domain/event';
import "./PlayerRow.css";
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';
import { useAuth } from '../contexts/AuthContext';
import Watch from './Watch';
import { Link } from 'react-router';
import ChannelLink from './ChannelLink';

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
        <div className="player-name">
          <Link to={`/players/${player.userId}`}>{player.name}</Link>
          {mode === "logs" && player.logs.filter(log => log.code.startsWith("Channel")).length === 0 && player.stream.length > 5 && <div style={{fontSize:'smaller'}}><a href={player.stream} target="_blank"><Watch width="30" height="30" style={{ color:"#5b6eae", verticalAlign: "middle", margin:'0 0.7rem' }} />Watch</a></div>}
        </div>
        {mode === "logs" && <div className="player-score">{player.score}</div>}
        {mode === "info" && player.logs.some(log => log.code.startsWith("PersonalBest")) && <div className="player-score">PB {player.logs.find(log => log.code.startsWith("PersonalBest"))!.code.split('=')[1]}</div>}
      </div>
      {mode === "info" && <div className="player-info">
        {player.logs.filter(log => log.code.startsWith("Channel")).map((log) => (
          <div key={log.code} style={{fontSize:'0.8rem'}}>
            {log.code.startsWith("ChannelYoutube=") && <ChannelLink url={log.code.split('=')[1]} />}
            {log.code.startsWith("ChannelTwitch=") && <ChannelLink url={log.code.split('=')[1]} />}
          </div>
        ))}
        {player.logs.filter(log => log.code.startsWith("Channel")).length === 0 && player.stream.length > 5 && <div style={{fontSize:'smaller'}}><a href={player.stream} target="_blank"><Watch width="30" height="30" style={{ color:"#5b6eae", verticalAlign: "middle", margin:'0 0.7rem' }} />Watch</a></div>}
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