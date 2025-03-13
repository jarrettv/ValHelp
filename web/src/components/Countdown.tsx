import React, { useEffect, useState } from 'react';

interface CountdownProps {
  targetTime: Date;
}

const Countdown: React.FC<CountdownProps> = ({ targetTime }) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = new Date().getTime();
      const difference = targetTime.getTime() - currentTime;

      setTimeRemaining(difference);

      if (difference <= 0) {
        setTimeRemaining(0);
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [targetTime]);

  const formatTime = (distance: number) => {
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
    const seconds = Math.floor((distance % (1000 * 60)) / 1000).toString().padStart(2, '0');
    const subsecs = Math.floor((distance % 1000) / 100);
    return `${hours}:${minutes}:${seconds}.${subsecs}`;
  };

  return (
    <div className={`countdown ${timeRemaining === 0 ? 'ended' : 'active'}`}>
      {formatTime(timeRemaining)}
    </div>
  );
};

export default Countdown;