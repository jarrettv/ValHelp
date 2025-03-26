import { useParams, useSearchParams } from 'react-router';
import { fetchPlayerCurrentEventId, useEvent } from './hooks/useEvent';
import ObsScores from './components/ObsScores';
import { useState } from 'react';

export default function EventScoreboard() {
  const { id, playerId } = useParams<{ id: string, playerId: string }>();
  let [searchParams] = useSearchParams();
  const [eventId, setEventId] = useState(parseInt(id ?? "0"));

  if (eventId === 0) {
    fetchPlayerCurrentEventId(parseInt(playerId ?? "0"))
      .then((lookupEventId) => {
        setEventId(lookupEventId);
      })
      .catch((reason) => {
        console.error('Failed to fetch current event', reason);
        return 0;
      });
  }

  const { data, isPending  } = useEvent(eventId);
  
  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  return (
    <ObsScores playerId={parseInt(playerId!)} event={data} bg={searchParams.get('bg') ?? undefined} title={searchParams.get('title') ?? undefined} score={searchParams.get('score') ?? undefined} active={searchParams.get('active') ?? undefined} max={parseInt(searchParams.get('max') ?? "6")} showTitle={searchParams.get('showTitle')=='true'} />
  );
}