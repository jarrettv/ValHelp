import React from 'react';
import { useQuery } from '@tanstack/react-query';
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

const Users: React.FC = () => {
  const { data, error, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers});

  if (isLoading) {
    return <Spinner />;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <table style={{width:'100%'}}>
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Discord</th>
          <th>Steam</th>
          <th>Alt Name</th>
          <th>Last Login</th>
        </tr>
      </thead>
      <tbody>
        {data!.map((user: any) => (
          <tr key={user.id}>
            <td style={{display:'flex', alignItems:'center'}}>
              <div style={{width:'4rem',textAlign:'center'}}><Link to={`/auth/users/${user.id}`}>{user.id}</Link></div>
              <img src={user.avatarUrl} alt="Avatar" width="30" height="30" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
              {user.username}
            </td>
            <td>{user.email}</td>
            <td>{user.discordId}</td>
            <td>{user.steamId}</td>
            <td>{user.altName}</td>
            <td>{user.isActive ? '✅' : '❌'}<TimeAgo targetTime={new Date(user.lastLoginAt)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Users;