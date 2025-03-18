import { useParams, useSearchParams } from 'react-router';
import { useEvent } from './hooks/useEvent';
import ObsOverview from './components/ObsOverview';

export default function EventFinal() {
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
    <ObsOverview playerId={parseInt(playerId!)} event={data} bg={searchParams.get('bg') ?? undefined} title={searchParams.get('title') ?? undefined} score={searchParams.get('score') ?? undefined} active={searchParams.get('active') ?? undefined} max={parseInt(searchParams.get('max') ?? "7")} />
  );
}