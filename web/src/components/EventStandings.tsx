import React from 'react';
import { Player } from '../domain/event';
import "./EventStandings.css";
import PlayerLogsRow from './PlayerLogsRow';

interface EventStandingsProps {
  players: Player[];
}

const EventStandings: React.FC<EventStandingsProps> = ({ players }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  return (
    <div className="event-standings">
      {sortedPlayers.map((player) => (
        <PlayerLogsRow key={player.userId} player={player} />
      ))}
    </div>
  );
};

export default EventStandings;