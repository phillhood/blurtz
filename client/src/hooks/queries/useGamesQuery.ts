import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gameService } from "@services/game.service";
import { CreateGameRequest } from "@types";

// Query keys
export const gameKeys = {
  all: ["games"] as const,
  listings: () => [...gameKeys.all, "listings"] as const,
  active: (userId: string) => [...gameKeys.all, "active", userId] as const,
  detail: (id: string) => [...gameKeys.all, "detail", id] as const,
};

// Queries
export const useGameListings = () => {
  return useQuery({
    queryKey: gameKeys.listings(),
    queryFn: () => gameService.getAvailableGames(),
  });
};

export const useActiveGames = (userId: string | undefined) => {
  return useQuery({
    queryKey: gameKeys.active(userId || ""),
    queryFn: () => gameService.getActiveGames(),
    enabled: !!userId,
  });
};

// Mutations
export const useCreateGame = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGameRequest) => gameService.createGame(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.listings() });
    },
  });
};

export const useJoinGameById = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => gameService.joinGame({ id: gameId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
};

export const useJoinGameByCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alias: string) => gameService.joinGame({ alias }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
};
