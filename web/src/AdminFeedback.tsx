import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { useAuth } from './contexts/AuthContext';

interface FeedbackEntry {
  userId: number;
  username: string;
  avatarUrl: string;
  page: string;
  msg: string;
  at: string;
}

const fetchFeedback = async (): Promise<FeedbackEntry[]> => {
  const res = await fetch('/api/admin/feedback', { credentials: 'include' });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const AdminFeedback: React.FC = () => {
  const { status } = useAuth();
  const { data, error, isLoading, isError } = useQuery<FeedbackEntry[]>({
    queryKey: ['admin-feedback'],
    queryFn: fetchFeedback,
    enabled: status?.id === 1,
  });

  if (status?.id !== 1) {
    return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  }
  if (isLoading) return <Spinner />;
  if (isError) return <div style={{ padding: '1rem', color: '#c66' }}>Error: {(error as Error).message}</div>;

  const entries = data ?? [];

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Feedback ({entries.length})</h2>
      {entries.length === 0 ? (
        <div style={{ color: '#888' }}>No feedback submitted.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>User</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>Page</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf' }}>Message</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8cf', whiteSpace: 'nowrap' }}>When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((f, i) => (
              <tr key={`${f.userId}-${f.at}-${i}`} style={{ borderBottom: '1px solid #2a2a3a', verticalAlign: 'top' }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                  <Link to={`/auth/users/${f.userId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cda', textDecoration: 'none' }}>
                    {f.avatarUrl && (
                      <img src={f.avatarUrl} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />
                    )}
                    {f.username}
                  </Link>
                </td>
                <td style={{ padding: '6px 8px', fontSize: '12px' }}>
                  <Link to={f.page} style={{ color: '#88bbff' }}>{f.page}</Link>
                </td>
                <td style={{ padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.msg}</td>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#888', fontSize: '12px' }}>
                  <TimeAgo targetTime={new Date(f.at)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminFeedback;
