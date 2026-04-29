import { useParams, useSearchParams } from 'react-router';
import { useEvent, useObsTarget } from './hooks/useEvent';

export default function EventTrophies() {
  const { id, playerId } = useParams<{ id: string, playerId: string }>();
  const [searchParams] = useSearchParams();
  const overrideEventId = id ? parseInt(id) : undefined;

  const { eventId } = useObsTarget(parseInt(playerId ?? '0'), overrideEventId);
  const { data, isPending } = useEvent(eventId);

  if (isPending) return 'Loading...';
  if (!data) return 'No data';

  return (
    <>{searchParams}</>
  );
}
