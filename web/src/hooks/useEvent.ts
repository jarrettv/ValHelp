import { useQuery } from '@tanstack/react-query';
import { Event, EventStatus } from '../domain/event';

class NotFoundError extends Error {
  status = 404;
  constructor() { super('Event not found'); }
}

const fetchEvent = async (id: number, password?: string, obsCode?: string): Promise<Event> => {
  const headers: Record<string, string> = {
    "If-None-Match": localStorage.getItem(`etag-${id}`) || ""
  };

  if (password) {
    headers["X-Private-Password"] = password;
  }

  // Sending X-Obs-Code switches the server to obs-code auth (cookie ignored).
  if (obsCode) {
    headers["X-Obs-Code"] = obsCode;
  }

  const response = await fetch(`/api/events/${id}`, { headers });
  if (response.status === 304) {
    var json = localStorage.getItem(`event-${id}`);
    return JSON.parse(json!) as Event;
  }
  if (response.status === 404) {
    throw new NotFoundError();
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

export const useEvent = (id: number, password?: string, obsCode?: string) => {
  return useQuery({
    queryKey: ['event', id, password, obsCode],
    queryFn: () => fetchEvent(id, password, obsCode),
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

// Legacy hook for /obs/<view>/<playerId> and /events/:id/<view>/:playerId.
// Uses cookie auth; private events only resolve when the viewer happens to
// be the owner/player. Use useObsByCode for the modern /obs2/* routes.
export interface ObsTarget {
  userId: number;
  eventId: number;
  isPending: boolean;
}

export function useObsTarget(playerId: number, eventIdOverride?: number): ObsTarget {
  const playerEvent = useQuery({
    queryKey: ['player-current-event', playerId],
    queryFn: () => fetchPlayerCurrentEventId(playerId),
    enabled: playerId > 0 && eventIdOverride === undefined,
    refetchInterval: 600_000,
  });

  return {
    userId: playerId,
    eventId: eventIdOverride ?? playerEvent.data ?? 0,
    isPending: eventIdOverride !== undefined ? false : playerEvent.isPending,
  };
}

// Hook for /obs2/<view>/<obsCode>. Resolves the user + their current event
// from the secret code only. The fetched event is gated server-side by the
// X-Obs-Code header (see fetchEvent), so cookie identity never grants access.
export interface ObsByCodeTarget {
  userId: number;
  eventId: number;
  obsCode: string | undefined;
  isPending: boolean;
}

export function useObsByCode(code: string | undefined): ObsByCodeTarget {
  const lookup = useQuery({
    queryKey: ['obs-lookup', code],
    queryFn: async () => {
      const res = await fetch(`/api/obs/lookup/${code}`);
      if (!res.ok) throw new Error('OBS code not found');
      return (await res.json()) as { userId: number; eventId: number };
    },
    enabled: !!code,
    refetchInterval: 600_000,
  });

  return {
    userId: lookup.data?.userId ?? 0,
    eventId: lookup.data?.eventId ?? 0,
    obsCode: code,
    isPending: lookup.isPending,
  };
}