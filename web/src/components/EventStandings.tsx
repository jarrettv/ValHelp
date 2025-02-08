import React from 'react';
import { EventStatus, Player } from '../domain/event';
import PlayerRow from './PlayerRow';

interface PlayerStandingsProps {
  players: Player[];
  eventStatus: EventStatus;
}

const PlayerStandings: React.FC<PlayerStandingsProps> = ({ players, eventStatus }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  const mode = eventStatus >= EventStatus.Live ? "logs" : "info";

  return (
    <div style={{marginTop:"1.4rem"}}>
      {sortedPlayers.map((player) => (
        <PlayerRow key={player.userId} player={player} mode={mode} />
      ))}
    </div>
  );
};

export default PlayerStandings;