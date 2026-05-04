import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { useAuth } from './contexts/AuthContext';
import { EventStatus } from './domain/event';

interface PrivateEventEntry {
  id: number;
  name: string;
  mode: string;
  status: number;
  startAt: string;
  endAt: string;
  hours: number;
  ownerId: number;
  ownerUsername: string;
  ownerAvatarUrl: string;
  privatePassword: string | null;
  playerCount: number;
  createdAt: string;
}

const fetchPrivateEvents = async (): Promise<PrivateEventEntry[]> => {
  const res = await fetch('/api/admin/private-events', { credentials: 'include' });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function statusLabel(s: number): { text: string; color: string } {
  switch (s) {
    case EventStatus.Draft: return { text: 'Draft', color: '#888' };
    case EventStatus.New: return { text: 'New', color: '#8cf' };
    case EventStatus.Live: return { text: 'Live', color: '#6c6' };
    case EventStatus.Over: return { text: 'Over', color: '#ca0' };
    case EventStatus.Old: return { text: 'Old', color: '#666' };
    default: return { text: String(s), color: '#888' };
  }
}

const AdminPrivateEvents: React.FC = () => {
  const { status } = useAuth();
  const { data, error, isLoading, isError } = useQuery<PrivateEventEntry[]>({
    queryKey: ['admin-private-events'],
    queryFn: fetchPrivateEvents,
    enabled: status?.id === 1,
  });

  if (status?.id !== 1) {
    return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  }
  if (isLoading) return <Spinner />;
  if (isError) return <div style={{ padding: '1rem', color: '#c66' }}>Error: {(error as Error).message}</div>;

  const entries = data ?? [];
  const liveCount = entries.filter(e => e.status === EventStatus.Live).length;

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Private Events ({entries.length} total, {liveCount} live)</h2>
      {entries.length === 0 ? (
        <div style={{ color: '#888' }}>No private events.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>Event</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>Owner</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf', whiteSpace: 'nowrap' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf', whiteSpace: 'nowrap' }}>Mode</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: '#8cf' }}>Players</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf', whiteSpace: 'nowrap' }}>Starts</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>Password</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const st = statusLabel(e.status);
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid #2a2a3a', verticalAlign: 'top' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <Link to={`/events/${e.id}`} style={{ color: '#cda', textDecoration: 'none', fontWeight: 600 }}>
                      {e.name}
                    </Link>
                    <div style={{ color: '#666', fontSize: '11px' }}>#{e.id}</div>
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <Link to={`/auth/users/${e.ownerId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cda', textDecoration: 'none' }}>
                      {e.ownerAvatarUrl && (
                        <img src={e.ownerAvatarUrl} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />
                      )}
                      {e.ownerUsername}
                    </Link>
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: st.color, fontWeight: 600, fontSize: '12px' }}>{st.text}</span>
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#ccc', fontSize: '12px' }}>{e.mode}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#ccc' }}>{e.playerCount}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#888', fontSize: '12px' }}>
                    <TimeAgo targetTime={new Date(e.startAt)} />
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>
                    {e.privatePassword ? (
                      <Link to={`/events/private/${e.privatePassword}`} style={{ color: '#88bbff' }}>{e.privatePassword}</Link>
                    ) : (
                      <span style={{ color: '#c66' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminPrivateEvents;
