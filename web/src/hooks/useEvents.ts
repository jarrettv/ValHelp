import { useQuery } from '@tanstack/react-query';
import { EventStatus } from '../domain/event';

export interface EventsResponse {
  data: EventRow[];
}

export interface EventRow {
  id: number;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  players: EventRowPlayer[];
  createdBy: string;
  isPrivate: boolean;
  ownerId: number;
}

export interface EventRowPlayer {
  id: number;
  name: string;
  avatarUrl: string;
  score: number;
}

const fetchEventsLatest = async (): Promise<EventsResponse> => {
  const response = await fetch('/api/events/latest');
  if (!response.ok) {
    throw new Error('Failed to fetch hunts');
  }
  return response.json();
};

export const useEventsLatest = () => {
  return useQuery({queryKey: ['events-latest'], queryFn: fetchEventsLatest, staleTime: 10000, refetchInterval: 10000});
};

const fetchUpcomingEvents = async (): Promise<EventsResponse> => {
  const response = await fetch('/api/events/upcoming');
  if (!response.ok) {
    throw new Error('Failed to fetch hunts');
  }
  return response.json();
};

export const useEventsUpcoming = () => {
  return useQuery({queryKey: ['events-upcoming'], queryFn: fetchUpcomingEvents, staleTime: 60000 * 5, refetchInterval: 60000 * 5});
};

const fetchEvents = async (): Promise<EventsResponse> => {
  const response = await fetch('/api/events');
  if (!response.ok) {
    throw new Error('Failed to fetch hunts');
  }
  return response.json();
};

export const useEvents = () => {
  return useQuery({queryKey: ['events-all'], queryFn: fetchEvents});
};

export function usePrivateEvents() {
  return useQuery({
    queryKey: ['private-events'],
    queryFn: () =>
      fetch('/api/events/private').then((res) =>
        res.json()
      ),
  });
}