import { useParams, useSearchParams } from 'react-router';
import { useEvent, useObsByCode } from './hooks/useEvent';
import ObsScores from './components/ObsScores';

export default function Obs2Scoreboard() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();

  const { userId, eventId, obsCode, isPending: lookupPending } = useObsByCode(code);
  const { data, isPending: eventPending } = useEvent(eventId, undefined, obsCode);

  if (lookupPending || eventPending) return 'Loading...';
  if (!data) return 'No data';

  return (
    <ObsScores
      playerId={userId}
      event={data}
      bg={searchParams.get('bg') ?? undefined}
      title={searchParams.get('title') ?? undefined}
      score={searchParams.get('score') ?? undefined}
      active={searchParams.get('active') ?? undefined}
      bubble={searchParams.get('bubble') ?? undefined}
      max={parseInt(searchParams.get('max') ?? "6")}
      hideTitle={searchParams.get('hideTitle') === 'true'}
    />
  );
}
