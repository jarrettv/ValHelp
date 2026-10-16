import React from 'react';
import { Player } from '../domain/event';
import "./EventStandings.css";
import PlayerLogsRow from './PlayerLogsRow';

interface EventStandingsProps {
  players: Player[];
  /** Set when the viewer can change their own registration. */
  onEditSelf?: () => void;
}

const EventStandings: React.FC<EventStandingsProps> = ({ players, onEditSelf }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  return (
    <div className="event-standings">
      {sortedPlayers.map((player) => (
        <PlayerLogsRow key={player.userId} player={player} onEditSelf={onEditSelf} />
      ))}
    </div>
  );
};

export default EventStandings;