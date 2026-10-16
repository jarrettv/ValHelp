import React from 'react';
import { Player } from '../domain/event';
import PlayerInfoRow from './PlayerInfoRow';
import "./EventStandings.css";
interface EventPlayersProps {
  players: Player[];
  /** Set when the viewer can change their own registration. */
  onEditSelf?: () => void;
}

const EventPlayers: React.FC<EventPlayersProps> = ({ players, onEditSelf }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  return (
    <div className="event-standings">
      {sortedPlayers.map((player) => (
        <PlayerInfoRow key={player.userId} player={player} onEditSelf={onEditSelf} />
      ))}
    </div>
  );
};

export default EventPlayers;