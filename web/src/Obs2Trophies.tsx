import { useParams, useSearchParams } from 'react-router';
import { useEvent, useObsByCode } from './hooks/useEvent';

export default function Obs2Trophies() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();

  const { eventId, obsCode, isPending: lookupPending } = useObsByCode(code);
  const { data, isPending: eventPending } = useEvent(eventId, undefined, obsCode);

  if (lookupPending || eventPending) return 'Loading...';
  if (!data) return 'No data';

  return (
    <>{searchParams}</>
  );
}
