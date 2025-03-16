import "./ObsScore.css";
import Countdown from './Countdown';
import { useEffect, useState } from 'react';

interface ObsScoreProps {
  avatarUrl: string;
  name: string;
  status: "pre" | "live" | "post";
  startAt: Date;
  endAt: Date;
  hours: number;
  value: number;
  bg?: string;
  score?: string;
  pre?: string;
  live?: string;
  post?: string;
}

export default function ObsScore(props: ObsScoreProps) {
    const [prevValue, setPrevValue] = useState(props.value);
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        if (prevValue !== props.value) {
            setPulse(true);
            setTimeout(() => setPulse(false), 500); // duration of the pulse animation
            setPrevValue(props.value);
        }
    }, [props.value, prevValue]);

  return (
    <div className="my-score" style={{ backgroundColor: props.bg ?? 'transparent' }}>
        <div className="my-score-avatar">
            <img src={props.avatarUrl} alt={props.name} />
        </div>
        <div className="my-score-text">
            <div className={`num score ${pulse ? 'pulse': ''}`} style={{color: props.score ?? '#fcc400'}}>{props.value}</div>
            { props.status === "pre" && <Countdown targetTime={new Date(props.startAt)} color={ props.pre ?? '#fff9' } message="START"/> }
            { props.status === "live" && <Countdown targetTime={new Date(props.endAt)} color={ props.live ?? '#72da83' } message="OVER" /> }
            { props.status === "post" && <div className="num countdown over" style={{color: props.post ?? '#9fd2ff'}}><small>{props.hours}h&#160;</small>FINAL</div>}
        </div>
    </div>
  );
}