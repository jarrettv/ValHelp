import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Spinner from './components/Spinner';
import { useAuth } from './contexts/AuthContext';
import { PUBLIC_WORLDS_KEY, fetchPublicWorlds, type PublicWorld, type PublicWorldsResp } from './components/publicWorlds';
import './AdminPublicWorlds.css';

// Admin: give each public world a user (shown by avatar) and a tiny tag, shown
// between the seed and the default badge in the seed picker
// (PUT api/admin/worlds/public/{seed}). Order/pinning stays in the seed picker.

interface UserItem { id: number; username: string; avatarUrl: string; isActive: boolean }

const TAG_MAX = 16;

export default function AdminPublicWorlds() {
  const { status } = useAuth();
  const isAdmin = status?.id === 1;
  const worlds = useQuery<PublicWorldsResp>({ queryKey: PUBLIC_WORLDS_KEY, queryFn: fetchPublicWorlds, enabled: isAdmin });
  const users = useQuery<UserItem[]>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/auth/users', { credentials: 'include' }).then(r => {
      if (!r.ok) throw new Error(`Users: HTTP ${r.status}`);
      return r.json();
    }),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  if (!isAdmin) return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  if (worlds.isLoading) return <Spinner />;
  return (
    <div className="apw">
      <h2>Public worlds</h2>
      <p className="apw-hint">
        A user and a tiny tag for each public world, shown in the seed picker between the seed and its
        default badge. Pin, unpin and reorder from the seed picker on /worlds.
      </p>
      {users.isError && <div className="apw-err">{(users.error as Error).message}</div>}
      <ul className="apw-list">
        {worlds.data?.worlds.map((w, i) => (
          <WorldRow key={w.seed} world={w} isDefault={i === 0} users={users.data ?? []} />
        ))}
      </ul>
    </div>
  );
}

function WorldRow({ world, isDefault, users }: { world: PublicWorld; isDefault: boolean; users: UserItem[] }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<number | null>(world.userId);
  const [tag, setTag] = useState(world.tag ?? '');
  useEffect(() => { setUserId(world.userId); setTag(world.tag ?? ''); }, [world.userId, world.tag]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/worlds/public/${encodeURIComponent(world.seed)}`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tag: tag.trim() || null }),
      });
      if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      return (await r.json()) as PublicWorldsResp;
    },
    onSuccess: resp => qc.setQueryData(PUBLIC_WORLDS_KEY, resp),
  });

  const dirty = userId !== world.userId || tag.trim() !== (world.tag ?? '');
  const user = users.find(u => u.id === userId)
    ?? (userId != null && userId === world.userId && world.avatarUrl
      ? { id: userId, username: world.username ?? `#${userId}`, avatarUrl: world.avatarUrl, isActive: true }
      : null);

  return (
    <li className="apw-row">
      <div className="apw-preview" title="How it looks in the seed picker">
        <span className="apw-seed">{world.seed}</span>
        {user && <img className="apw-avatar-sm" src={user.avatarUrl} alt="" />}
        {tag.trim() && <span className="apw-tag">{tag.trim()}</span>}
        {isDefault && <span className="apw-badge">default</span>}
      </div>
      <UserPicker users={users} value={user} onChange={u => setUserId(u?.id ?? null)} />
      <input className="apw-tag-input" value={tag} maxLength={TAG_MAX} placeholder="tag"
             onChange={e => setTag(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter' && dirty) save.mutate(); }} />
      <button className="apw-save" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save'}
      </button>
      {save.isError && <div className="apw-err">{(save.error as Error).message}</div>}
    </li>
  );
}

/** Type a name (or #id) to find a user; shows avatars. */
function UserPicker({ users, value, onChange }: { users: UserItem[]; value: UserItem | null; onChange: (u: UserItem | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^#/, '');
    const list = t
      ? users.filter(u => u.username.toLowerCase().includes(t) || String(u.id) === t)
      : users;
    return [...list].sort((a, b) => {
      // Name starting with the query first, then active users, then by name.
      const sa = t && a.username.toLowerCase().startsWith(t) ? 0 : 1;
      const sb = t && b.username.toLowerCase().startsWith(t) ? 0 : 1;
      return sa - sb || Number(b.isActive) - Number(a.isActive) || a.username.localeCompare(b.username);
    }).slice(0, 12);
  }, [q, users]);
  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (u: UserItem | null) => { onChange(u); setQ(''); setOpen(false); };

  return (
    <div className="apw-user" ref={root}>
      {value && !open ? (
        <button className="apw-user-chosen" onClick={() => setOpen(true)} title="Change user">
          <img className="apw-avatar" src={value.avatarUrl} alt="" />
          <span>{value.username}</span>
          <span className="apw-user-id">#{value.id}</span>
        </button>
      ) : (
        <input autoFocus={open} className="apw-user-input" placeholder="Find user…" value={q}
               onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }}
               onKeyDown={e => {
                 if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
                 else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
                 else if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
                 else if (e.key === 'Escape') { setQ(''); setOpen(false); }
               }} />
      )}
      {value && <button className="apw-clear" title="No user" onClick={() => pick(null)}>×</button>}
      {open && (
        <ul className="apw-user-menu" role="listbox">
          {matches.length === 0 && <li className="apw-user-none">No match</li>}
          {matches.map((u, i) => (
            <li key={u.id}>
              <button role="option" aria-selected={u.id === value?.id}
                      className={`apw-user-opt${i === hi ? ' hi' : ''}`}
                      onMouseEnter={() => setHi(i)} onClick={() => pick(u)}>
                <img className="apw-avatar" src={u.avatarUrl} alt="" loading="lazy" />
                <span>{u.username}</span>
                <span className="apw-user-id">#{u.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
