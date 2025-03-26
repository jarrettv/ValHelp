import { useParams, useSearchParams } from 'react-router';
import { fetchPlayerCurrentEventId, useEvent } from './hooks/useEvent';
import ObsScore from './components/ObsScore';
import { EventStatus } from './domain/event';
import { useEffect, useState } from 'react';

export default function EventScore() {
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

  const { data, isPending } = useEvent(eventId);

  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  const player = data.players.find(player => player.userId === parseInt(playerId ?? "0"));
  const status = data.status <= EventStatus.New ? "pre" : data.status === EventStatus.Live ? "live" : "post";
  if (!player) {
    return 'No player';
  }

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