import { useGameListings, useActiveGames } from "./queries/useGamesQuery";
import { useAuthStore } from "@stores";

export const useGames = () => {
  const userId = useAuthStore((state) => state.user?.id);

  const {
    data: availableGames = [],
    isLoading: isLoadingAvailable,
    error: availableError,
    refetch: refetchAvailable,
  } = useGameListings();

  const {
    data: activeGames = [],
    isLoading: isLoadingActive,
    error: activeError,
    refetch: refetchActive,
  } = useActiveGames(userId);

  const refetch = async () => {
    await Promise.all([refetchAvailable(), refetchActive()]);
  };

  return {
    activeGames,
    availableGames,
    loading: isLoadingAvailable || isLoadingActive,
    error: availableError?.message || activeError?.message || null,
    refetch,
  };
};
