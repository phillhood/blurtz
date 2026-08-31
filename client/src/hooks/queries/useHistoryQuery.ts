import { useQuery } from "@tanstack/react-query";
import { historyService } from "@services/history.service";

// Query keys
export const historyKeys = {
  all: ["history"] as const,
  list: () => [...historyKeys.all, "list"] as const,
  detail: (gameId: string) => [...historyKeys.all, "detail", gameId] as const,
};

// Queries
export const useMatchHistory = () => {
  return useQuery({
    queryKey: historyKeys.list(),
    queryFn: () => historyService.getHistory(),
  });
};

export const useGameResults = (gameId: string | undefined) => {
  return useQuery({
    queryKey: historyKeys.detail(gameId || ""),
    queryFn: () => historyService.getResults(gameId as string),
    enabled: !!gameId,
  });
};
