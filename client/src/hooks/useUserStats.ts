import { useMemo } from "react";
import { User, UserStats } from "@types";

export const useUserStats = (user: User | null): UserStats => {
  return useMemo(() => {
    if (!user) {
      return { gamesPlayed: 0, gamesWon: 0, winRate: 0 };
    }

    const gamesPlayed = user.gamesPlayed || 0;
    const gamesWon = user.gamesWon || 0;
    const winRate =
      gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

    return { gamesPlayed, gamesWon, winRate };
  }, [user]);
};
