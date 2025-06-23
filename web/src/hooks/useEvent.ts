import { useQuery } from '@tanstack/react-query';
import { Event, EventStatus } from '../domain/event';

const fetchEvent = async (id: number, password?: string): Promise<Event> => {
  const headers: Record<string, string> = {
    "If-None-Match": localStorage.getItem(`etag-${id}`) || ""
  };
  
  if (password) {
    headers["X-Private-Password"] = password;
  }
  
  const response = await fetch(`/api/events/${id}`, { headers });
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

const fetchEventByPassword = async (password: string): Promise<Event> => {
  const response = await fetch(`/api/events/private/${password}`);
  if (!response.ok) {
    throw new Error('Failed to fetch event details');
  }
  const data = await response.json();
  return data;
};

export const useEditEvent = (id: number) => {
  return useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id) });
};

export const useEvent = (id: number, password?: string) => {
  return useQuery({ 
    queryKey: ['event', id, password], 
    queryFn: () => fetchEvent(id, password), 
    refetchInterval(query) {
      if (query.state.data && query.state.data?.status <= EventStatus.Live) {
        return 5000;
      }
      return false;
    }, 
    enabled: id !== 0 
  });
};

export const useEventByPassword = (password: string) => {
  return useQuery({ 
    queryKey: ['event-by-password', password], 
    queryFn: () => fetchEventByPassword(password), 
    refetchInterval(query) {
      if (query.state.data && query.state.data?.status <= EventStatus.Live) {
        return 5000;
      }
      return false;
    }, 
    enabled: password !== "" 
  });
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