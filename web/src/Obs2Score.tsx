import { useParams, useSearchParams } from 'react-router';
import { useEvent, useObsByCode } from './hooks/useEvent';
import ObsScore from './components/ObsScore';
import { EventStatus } from './domain/event';

export default function Obs2Score() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();

  const { userId, eventId, obsCode, isPending: lookupPending } = useObsByCode(code);
  const { data, isPending: eventPending } = useEvent(eventId, undefined, obsCode);

  if (lookupPending || eventPending) return 'Loading...';
  if (!data) return 'No data';

  const player = data.players.find(p => p.userId === userId);
  if (!player) return 'No player';

  const status = data.status <= EventStatus.New ? "pre" : data.status === EventStatus.Live ? "live" : "post";
  return (
    <ObsScore
      avatarUrl={player.avatarUrl}
      name={player.name}
      status={status}
      startAt={data.startAt}
      endAt={data.endAt}
      hours={data.hours}
      value={player.score}
      bg={searchParams.get('bg') ?? undefined}
      score={searchParams.get('score') ?? undefined}
      pre={searchParams.get('pre') ?? undefined}
      live={searchParams.get('live') ?? undefined}
      post={searchParams.get('post') ?? undefined}
    />
  );
}
