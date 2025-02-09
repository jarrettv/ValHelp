import React from 'react';
import { EventStatus, Player } from '../domain/event';
import PlayerRow from './PlayerRow';
import "./EventStandings.css";

interface EventStandingsProps {
  players: Player[];
  eventStatus: EventStatus;
}

const EventStandings: React.FC<EventStandingsProps> = ({ players, eventStatus }) => {
  const sortedPlayers = players.sort((a, b) => b.score - a.score);
  const mode = eventStatus >= EventStatus.Live ? "logs" : "info";

  return (
    <div className="event-standings">
      {sortedPlayers.map((player) => (
        <PlayerRow key={player.userId} player={player} mode={mode} />
      ))}
    </div>
  );
};

export default EventStandings;