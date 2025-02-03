import { useQuery } from '@tanstack/react-query';
import { Event, Player } from '../domain/event';

const fetchEvent = async (id: number): Promise<Event> => {
  const response = await fetch(`/api/events/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch event details');
  }
  return response.json();
};

export const useEvent = (id: number) => {
  return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id) });
};

export const useActiveEvent = (id: number) => {
  return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id), staleTime: 10000, refetchInterval: 30000 });
};

const fetchPlayers = async (id: number): Promise<Player[]> => {
  const response = await fetch(`/api/events/${id}/players`);
  if (!response.ok) {
    throw new Error('Failed to fetch event players');
  }
  return response.json();
};

export const usePlayers = (id: number) => {
  return useQuery({ queryKey: ['event-players', id], queryFn: () => fetchPlayers(id), refetchInterval: 5000 });
};