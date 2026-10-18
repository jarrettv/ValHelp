import { useQuery } from '@tanstack/react-query';

// The public worlds anyone can open on /worlds (default first), as set by the
// site owner from the seed picker (api/ModuleWorlds/WorldsPublic.cs).

const FALLBACK_SEED = 'JVModsFun';

/// The public worlds, default first (falls back to the long-standing one).
export function usePublicWorlds() {
  const q = useQuery<string[]>({
    queryKey: ['public-worlds'],
    queryFn: () => fetch('/api/worlds/public').then(r => (r.ok ? r.json() : { seeds: [] })).then(r => r.seeds ?? []),
    staleTime: 60_000,
  });
  return { seeds: q.data?.length ? q.data : q.isPending ? null : [FALLBACK_SEED], pending: q.isPending };
}
