import React, { useEffect, useState } from 'react';

interface CountdownProps {
  targetTime: Date;
  color: string;
  message: string;
}

const Countdown: React.FC<CountdownProps> = ({ targetTime, color, message }) => {
  const [hours, setHours] = useState<number>(0);
  const [mins, setMins] = useState<number>(0);
  const [secs, setSecs] = useState<number>(0);
  const [sub, setSub] = useState<number>(0);
  const [over, setOver] = useState<boolean>(false);
  const [pulse, setPulse] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = new Date().getTime();
      const distance = targetTime.getTime() - currentTime;

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      setHours(hours);

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      setMins(minutes);

      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setSecs(seconds);

      const subsecs = Math.floor((distance % 1000) / 100);
      setSub(subsecs);

      if (distance < 6000) {
        setPulse(true);
      }

      if (distance <= 0) {
        setHours(0);
        setMins(0);
        setSecs(0);
        setSub(0);
        setOver(true);
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [targetTime]);

  return (
    <div className={`num countdown ${pulse? 'pulse':''}`} style={{ color: color }}>
      {over ? message : <>
      <div>{hours}</div>:
      <div>{String(mins).padStart(2, "0")[0]}</div>
      <div>{String(mins).padStart(2, "0")[1]}</div>:
      <div>{String(secs).padStart(2, "0")[0]}</div>
      <div>{String(secs).padStart(2, "0")[1]}</div>.
      <div className="sub">{sub}</div>
      </>}
    </div>
  );
};

export default Countdown;