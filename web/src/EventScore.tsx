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
    <div className="event-my-score" style={{ backgroundColor: searchParams.get('bg') ?? 'transparent' }}>
        <div className="my-avatar">
            <img src={player?.avatarUrl} alt="Player Avatar" />
        </div>
      <div className="score large">{player?.score ?? 0}</div>
      <Countdown targetTime={new Date(data.endAt)} />
    </div>
  );
}