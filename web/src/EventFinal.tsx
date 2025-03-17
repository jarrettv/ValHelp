import { useParams, useSearchParams } from 'react-router';
import { useEvent } from './hooks/useEvent';
import ObsFinal from './components/ObsFinal';

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
    <ObsFinal playerId={parseInt(playerId!)} event={data} bg={searchParams.get('bg') ?? undefined} title={searchParams.get('title') ?? undefined} score={searchParams.get('score') ?? undefined} active={searchParams.get('active') ?? undefined} max={parseInt(searchParams.get('max') ?? "7")} />
  );
}