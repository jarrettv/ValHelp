import { useParams, useSearchParams } from 'react-router';
import { useEvent } from './hooks/useEvent';
import EventStandings from './components/EventStandings';

export default function EventScoreboard() {
  const { id, playerId } = useParams<{ id: string, playerId: string }>();
  let [searchParams] = useSearchParams();
  const { data, isPending } = useEvent(parseInt(id!));
  console.debug(playerId);
  if (isPending) {
    return 'Loading...';
  }

  if (!data) {
    return 'No data';
  }

  return (
    <div className="obs-standings" style={{ backgroundColor: searchParams.get('bg') ?? 'transparent' }}>
        <EventStandings players={data.players} />
    </div>
  );
}