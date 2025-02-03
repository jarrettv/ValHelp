import React from 'react';
import './HuntPlacement.css';

interface HuntPlacementProps {
  placeNumber: number;
  playerAvatar: string;
  playerName: string;
  score: number;
}

const HuntPlacement: React.FC<HuntPlacementProps> = ({ placeNumber, playerAvatar, playerName, score }) => {
  const getPlaceSuffix = (place: number) => {
    if (place === 1) return 'st';
    if (place === 2) return 'nd';
    if (place === 3) return 'rd';
    return 'th';
  };

  return (
    <div className="hunt-placement">
      <div className="place-number">{placeNumber}<sup>{getPlaceSuffix(placeNumber)}</sup></div>
      <img src={playerAvatar} alt={`${playerName}'s avatar`} />
      <div className="player-name">{playerName}</div>
      <div className="score">{score}</div>
    </div>
  );
};

export default HuntPlacement;