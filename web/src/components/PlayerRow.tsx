import React from 'react';
import { Player } from '../domain/event';
import "./PlayerRow.css";
import { PlayerTrophy } from './PlayerTrophy';
import { PlayerPenalty } from './PlayerPenalty';

interface PlayerRowProps {
  player: Player;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player }) => {
  return (
    <div className="player-row">
      <div className="player-info">
        <img src={player.avatarUrl} alt={player.name} className="player-avatar" />
        <div className="player-name">{player.name}</div>
        <div className="player-score">{player.score}</div>
      </div>
      <div className="player-logs">
        {player.logs.map((log, index) => 
          log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> : 
          log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> : null
        )}
      </div>
    </div>
  );
};

export default PlayerRow;