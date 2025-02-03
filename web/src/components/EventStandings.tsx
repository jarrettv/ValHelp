import React from 'react';
import { Player } from '../domain/event';
import PlayerRow from './PlayerRow';

interface PlayerStandingsProps {
  players: Player[];
}

const PlayerStandings: React.FC<PlayerStandingsProps> = ({ players }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);

  return (
    <div style={{marginTop:"1.4rem"}}>
      {sortedPlayers.map((player) => (
        <PlayerRow key={player.userId} player={player} />
      ))}
    </div>
  );
};

export default PlayerStandings;