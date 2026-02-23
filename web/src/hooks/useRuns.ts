import { useQuery } from '@tanstack/react-query';
import type { RunDetails, RunRow } from '../domain/run';

const fetchRuns = async (): Promise<RunRow[]> => {
  const response = await fetch('/api/runs');
  if (!response.ok) {
    throw new Error('Failed to fetch runs');
  }
  return response.json();
};

const fetchRun = async (id: number): Promise<RunDetails> => {
  const response = await fetch(`/api/runs/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch run');
  }
  return response.json();
};

export const useRuns = (enabled: boolean) => {
  return useQuery({ queryKey: ['runs'], queryFn: fetchRuns, enabled });
};

export const useRun = (id: number | null, enabled: boolean) => {
  return useQuery({ queryKey: ['run', id], queryFn: () => fetchRun(id!), enabled: enabled && id !== null });
};
