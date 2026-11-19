import { useQuery } from '@tanstack/react-query';

// The public worlds anyone can open on /worlds (default first), as set by the
// site owner from the seed picker; each may carry a user (shown by avatar) and a
// tiny tag, set on /auth/public-worlds (api/ModuleWorlds/WorldsPublic.cs).

const FALLBACK_SEED = 'JVModsFun';

export interface PublicWorld {
  seed: string;
  tag: string | null;
  userId: number | null;
  username: string | null;
  avatarUrl: string | null;
}
export interface PublicWorldsResp { seeds: string[]; worlds: PublicWorld[] }

export const PUBLIC_WORLDS_KEY = ['public-worlds'];

export async function fetchPublicWorlds(): Promise<PublicWorldsResp> {
  const r = await fetch('/api/worlds/public');
  const j = r.ok ? await r.json() : {};
  const seeds: string[] = j.seeds ?? [];
  const worlds: PublicWorld[] = j.worlds
    ?? seeds.map(seed => ({ seed, tag: null, userId: null, username: null, avatarUrl: null }));
  return { seeds, worlds };
}

/// The public worlds, default first (falls back to the long-standing one).
export function usePublicWorlds() {
  const q = useQuery<PublicWorldsResp>({
    queryKey: PUBLIC_WORLDS_KEY,
    queryFn: fetchPublicWorlds,
    staleTime: 60_000,
  });
  const seeds = q.data?.seeds.length ? q.data.seeds : q.isPending ? null : [FALLBACK_SEED];
  const bySeed = new Map((q.data?.worlds ?? []).map(w => [w.seed, w]));
  return { seeds, worlds: q.data?.worlds ?? [], bySeed, pending: q.isPending };
}
