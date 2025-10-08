import { useQuery } from "@tanstack/react-query";

export interface ScoringRecord {
  code: string;
  name: string;
  scores: Record<string, number>;
  rates?: Record<string, number> | null;
  dropRateType: string;
  modes: string[];
  isActive: boolean;
}

export interface ScoringListResponse {
  data: ScoringRecord[];
  total: number;
}

const fetchScorings = async (): Promise<ScoringListResponse> => {
  const response = await fetch("/api/scoring");
  if (!response.ok) {
    throw new Error("Failed to fetch scoring data");
  }
  return response.json();
};

export const useScorings = () =>
  useQuery({
    queryKey: ["scorings"],
    queryFn: fetchScorings,
    staleTime: 60_000,
  });
