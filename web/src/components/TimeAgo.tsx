import React, { useEffect, useState } from 'react';

interface TimeAgoProps {
  targetTime: Date;
}

const TimeAgo: React.FC<TimeAgoProps> = ({ targetTime }) => {
  const [timeElapsed, setTimeElapsed] = useState<number>(0);

  useEffect(() => {
    const updateElapsedTime = () => {
      const currentTime = new Date().getTime();
      const difference = currentTime - targetTime.getTime();
      setTimeElapsed(difference);
    };

    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [targetTime]);

  const formatTime = (milliseconds: number) => {
    milliseconds = Math.abs(milliseconds);
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);

    if (milliseconds <= 5 * 60 * 1000) {
      return "minutes";
    }
    if (days >= 1) {
      return `${days} days`;
    }
    if (hours == 0) {
      return `${minutes} mins`;
    }
    return `${hours}h ${minutes}m`;
  };

  return (
    <span className="timeago">{formatTime(timeElapsed)}</span>
  );
};

export default TimeAgo;