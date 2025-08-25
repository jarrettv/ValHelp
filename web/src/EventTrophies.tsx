import { useParams, useSearchParams } from 'react-router';
import { fetchPlayerCurrentEventId, useEvent } from './hooks/useEvent';
import { useEffect, useState } from 'react';

export default function EventTrophies() {
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
    <>{searchParams}</>
  );
}