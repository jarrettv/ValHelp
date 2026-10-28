import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { track } from '../lib/analytics';

// Worlds a logged-in user pinned to their account (api ModuleWorlds/WorldsPins.cs):
// only the seed is kept, and each browser generates and caches the world itself.

export interface PinsResp { pins: { seed: string; at: string }[]; limit: number }

async function send(method: 'PUT' | 'DELETE', seed: string): Promise<PinsResp> {
  const r = method === 'PUT'
    ? await fetch('/api/worlds/pins', { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed }) })
    : await fetch(`/api/worlds/pins/${encodeURIComponent(seed)}`, { method, credentials: 'include' });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const p = await r.json(); msg = p.detail ?? p.title ?? msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.json();
}

/** The user's pinned worlds (empty when logged out), and pin/unpin. */
export function usePinnedWorlds(loggedIn: boolean) {
  const qc = useQueryClient();
  const q = useQuery<PinsResp>({
    queryKey: ['world-pins'],
    queryFn: () => fetch('/api/worlds/pins', { credentials: 'include' }).then(r => (r.ok ? r.json() : { pins: [], limit: 0 })),
    enabled: loggedIn,
    staleTime: 60_000,
  });
  const m = useMutation({
    mutationFn: ({ seed, on }: { seed: string; on: boolean }) => send(on ? 'PUT' : 'DELETE', seed),
    onSuccess: (data, { seed, on }) => { qc.setQueryData(['world-pins'], data); track(on ? 'pin' : 'unpin', seed); },
  });
  const pins = loggedIn ? (q.data?.pins ?? []).map(p => p.seed) : [];
  return {
    pins,
    limit: q.data?.limit ?? 4,
    loaded: !loggedIn || !q.isPending,
    setPinned: (seed: string, on: boolean) => m.mutate({ seed, on }),
    busy: m.isPending,
    error: m.error as Error | null,
  };
}
