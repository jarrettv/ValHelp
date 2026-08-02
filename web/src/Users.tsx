import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { Link } from 'react-router';
import { biomeLabel } from './guides/vh/spoiler';

export interface User {
  id: number;
  username: string;
  avatarUrl: string;
  lastLoginAt: string;
  discordId: string;
  isActive: boolean;
  favCount: number;
  speedRunCount: number;
  spoiler: number | null;
  feedbackCount: number;
  blocked: string | null;
}

const fetchUsers = async (): Promise<User[]> => {
  const response = await fetch('/api/auth/users');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: '#8cf' };
const num: React.CSSProperties = { padding: '6px 8px', textAlign: 'center' };
// Zero/unset counts stay grey so a customised pref stands out at a glance.
const none = <span style={{ color: '#555' }}>–</span>;

const Users: React.FC = () => {
  const { data, error, isLoading, isError } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  if (isLoading) {
    return <Spinner />;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #444' }}>
            <th style={th}>Username</th>
            <th style={th}>Discord</th>
            <th style={{ ...th, textAlign: 'center' }} title="Favourited items">Favs</th>
            <th style={{ ...th, textAlign: 'center' }} title="Speedrun items">Runs</th>
            <th style={{ ...th, textAlign: 'center' }} title="Spoiler level (biomes revealed)">Spoiler</th>
            <th style={{ ...th, textAlign: 'center' }} title="Feedback submitted">Feedback</th>
            <th style={th}>Last Login</th>
          </tr>
        </thead>
        <tbody>
          {data!.map((user: User) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #2a2a3a' }}>
              <td style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '4rem', textAlign: 'center' }}>
                  <Link to={`/auth/users/${user.id}`}>{user.id}</Link>
                </div>
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  width="30"
                  height="30"
                  style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}
                />
                {user.blocked != null ? (
                  <span style={{ textDecoration: 'line-through', color: '#c66' }} title={`Blocked: ${user.blocked}`}>
                    {user.username}
                  </span>
                ) : (
                  user.username
                )}
              </td>
              <td style={{ padding: '6px 8px' }}>{user.discordId}</td>
              <td style={num}>{user.favCount || none}</td>
              <td style={num}>{user.speedRunCount || none}</td>
              <td style={num}>
                {user.spoiler == null ? none : (
                  <span title={biomeLabel(user.spoiler - 1)}>{user.spoiler}</span>
                )}
              </td>
              <td style={num}>
                {user.feedbackCount ? (
                  <Link to="/auth/feedback">{user.feedbackCount}</Link>
                ) : none}
              </td>
              <td style={{ padding: '6px 8px' }}>
                {user.isActive ? '✅' : '❌'}<TimeAgo targetTime={new Date(user.lastLoginAt)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Users;
