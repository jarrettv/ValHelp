import { useParams, useSearchParams } from 'react-router';
import { fetchPlayerCurrentEventId, useEvent } from './hooks/useEvent';
import ObsScores from './components/ObsScores';
import { useEffect, useState } from 'react';

export default function EventScoreboard() {
  const { id, playerId } = useParams<{ id: string, playerId: string }>();
  let [searchParams] = useSearchParams();
  const [eventId, setEventId] = useState(parseInt(id ?? "0"));

  const getEventId = () => 
    fetchPlayerCurrentEventId(parseInt(playerId ?? "0"))
      .then(setEventId)
      .catch((reason) => {
        console.error('Failed to fetch current event', reason);
      });

  useEffect(() => {
    if (!id) {
      getEventId();
      const interval = setInterval(getEventId, 600000); // 10 minutes in milliseconds
      return () => clearInterval(interval);
    }
  }, [id, playerId]);

  const { data, isPending  } = useEvent(eventId);
  
  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  return (
    <ObsScores playerId={parseInt(playerId!)} event={data} bg={searchParams.get('bg') ?? undefined} title={searchParams.get('title') ?? undefined} score={searchParams.get('score') ?? undefined} active={searchParams.get('active') ?? undefined} max={parseInt(searchParams.get('max') ?? "6")} hideTitle={searchParams.get('hideTitle') === 'true'} />
  );
}