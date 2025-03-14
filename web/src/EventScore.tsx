import { useParams, useSearchParams } from 'react-router';
import { useEvent } from './hooks/useEvent';
import "./EventScore.css";
import Countdown from './components/Countdown';

export default function EventScore() {
  const { id, playerId } = useParams<{ id: string, playerId: string }>();
  let [searchParams] = useSearchParams();
  const { data, isPending } = useEvent(parseInt(id!));

  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  const player = data.players.find(player => player.userId === parseInt(playerId ?? "0"));

  return (
    <div className="my-score" style={{ backgroundColor: searchParams.get('bg') ?? 'transparent' }}>
        <div className="my-score-avatar">
            <img src={player?.avatarUrl} alt="Player Avatar" />
        </div>
        <div className="my-score-text">
            <div className="num score">{player?.score}</div>
            <Countdown targetTime={new Date(data.endAt)} />
        </div>
    </div>
  );
}