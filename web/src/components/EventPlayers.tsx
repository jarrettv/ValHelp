import React from 'react';
import { Player } from '../domain/event';
import PlayerInfoRow from './PlayerInfoRow';
import "./EventStandings.css";
interface EventPlayersProps {
  players: Player[];
}

const EventPlayers: React.FC<EventPlayersProps> = ({ players }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  return (
    <div className="event-standings">
      {sortedPlayers.map((player) => (
        <PlayerInfoRow key={player.userId} player={player} />
      ))}
    </div>
  );
};

export default EventPlayers;