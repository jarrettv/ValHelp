import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { Link } from 'react-router';

export interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  lastLoginAt: string;
  discordId: string;
  steamId: string;
  altName: string;
  isActive: boolean;
}

const fetchUsers = async (): Promise<User[]> => {
  const response = await fetch('/api/auth/users');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

const postUsers = async (csv: string): Promise<void> => {
  const response = await fetch('/api/auth/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/csv',
    },
    body: csv,
  });
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
};

const Users: React.FC = () => {
  const [csvData, setCsvData] = useState('');
  const { data, error, isLoading, isError } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const mutation = useMutation({ mutationFn: postUsers });

  const handleCsvChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCsvData(e.target.value);
  };

  const handleCsvSubmit = () => {
    mutation.mutate(csvData);
  };

  if (isLoading) {
    return <Spinner />;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Steam</th>
            <th>Alt Name</th>
            <th>Discord</th>
            <th>Email</th>
            <th>Last Login</th>
          </tr>
        </thead>
        <tbody>
          {data!.map((user: User) => (
            <tr key={user.id}>
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
                {user.username}
              </td>
              <td>{user.steamId}</td>
              <td>{user.altName}</td>
              <td>{user.discordId}</td>
              <td>{user.email}</td>
              <td>
                {user.isActive ? '✅' : '❌'}<TimeAgo targetTime={new Date(user.lastLoginAt)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      
      <textarea
        value={csvData}
        onChange={handleCsvChange}
        placeholder="Paste CSV data here"
        rows={10}
        cols={50}
      />
      <button onClick={handleCsvSubmit}>Submit CSV</button>
    </div>
  );
};

export default Users;