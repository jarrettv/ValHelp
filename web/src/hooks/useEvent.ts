import { useQuery } from '@tanstack/react-query';
import { Event, EventStatus } from '../domain/event';

const fetchEvent = async (id: number): Promise<Event> => {
  const response = await fetch(`/api/events/${id}`,
    {
      headers: {
        "If-None-Match": localStorage.getItem(`etag-${id}`) || ""
      }
    }
  );
  if (response.status === 304) {
    var json = localStorage.getItem(`event-${id}`);
    return JSON.parse(json!) as Event;
  }
  if (!response.ok) {
    throw new Error('Failed to fetch event details');
  }
  const data = await response.json();
  const newEtag = response.headers.get("ETag");
  if (newEtag) {
    localStorage.setItem(`etag-${id}`, newEtag);
    localStorage.setItem(`event-${id}`, JSON.stringify(data));
  }
  return data;
};

export const useEditEvent = (id: number) => {
  return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id) });
};

export const useEvent = (id: number) => {
  return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id), refetchInterval(query) {
    if (query.state.data && query.state.data?.status <= EventStatus.Live) {
      return 5000;
    }
    return false;
  }, enabled: id !== 0 });
};

export const fetchPlayerCurrentEventId = async (id: number): Promise<number> => {
  const response = await fetch(`/api/players/${id}/current-event`);
  if (!response.ok) {
    throw new Error('Failed to fetch current event');
  }
  const data = await response.json();
  console.debug('fetchPlayerCurrentEventId', id, data);
  return data;
};

// export const useCurrentEvent = (eventId: number, playerId: number) => {
//   if (eventId === 0) {
//     eventId = fetchPlayerCurrentEventId(playerId);
//   }

//   return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id), refetchInterval(query) {
//     if (query.state.data && query.state.data?.status <= EventStatus.Live) {
//       return 5000;
//     }
//     return false;
//   } });
// };


// const fetchPlayers = async (id: number): Promise<Player[]> => {
//   const response = await fetch(`/api/events/${id}/players`);
//   if (!response.ok) {
//     throw new Error('Failed to fetch event players');
//   }
//   return response.json();
// };

// export const usePlayers = (id: number) => {
//   return useQuery({ queryKey: ['event-players', id], queryFn: () => fetchPlayers(id), refetchInterval: 5000 });
// };