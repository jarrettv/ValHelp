import { useParams } from 'react-router';
import { useEvent } from './hooks/useEvent';
import { useAuth } from './contexts/AuthContext';
import "./EventScore.css";
import Countdown from './components/Countdown';

export default function EventScore() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending } = useEvent(parseInt(id!));
  const { status } = useAuth();

  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  const playerScore = data.players.find(player => player.userId === status?.id)?.score || 0;

  return (
    <div className="event-my-score">
        <div className="my-avatar">
            <img src={status?.avatarUrl} alt="Player Avatar" />
        </div>
      <div className="score large">{playerScore}</div>
      <Countdown targetTime={new Date(data.endAt)} />
    </div>
  );
}