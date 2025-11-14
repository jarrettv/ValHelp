import { useQuery } from "@tanstack/react-query";
import { SeasonDetails, SeasonListResponse } from "../domain/season";

const fetchSeasons = async (): Promise<SeasonListResponse> => {
  const response = await fetch("/api/series");
  if (!response.ok) {
    throw new Error("Failed to fetch seasons");
  }
  return response.json();
};

export const useSeasons = () => {
  return useQuery({ queryKey: ["seasons"], queryFn: fetchSeasons, staleTime: 60_000 });
};

const fetchSeason = async (code: string): Promise<SeasonDetails> => {
  const response = await fetch(`/api/series/${code}`);
  if (!response.ok) {
    throw new Error("Failed to fetch season details");
  }
  return response.json();
};

const fetchSeasonDefaults = async (): Promise<SeasonDetails> => {
  const response = await fetch("/api/series/0");
  if (response.status === 401) {
    throw new Error("You need to be logged in to manage seasons");
  }
  if (!response.ok) {
    throw new Error("Failed to load default season");
  }
  return response.json();
};

export const useSeason = (code: string) => {
  return useQuery({
    queryKey: ["season", code],
    queryFn: () => fetchSeason(code),
    enabled: code !== "" && code !== "new",
  });
};

export const useSeasonDefaults = (enabled: boolean) => {
  return useQuery({
    queryKey: ["season", "new"],
    queryFn: fetchSeasonDefaults,
    enabled,
  });
};
