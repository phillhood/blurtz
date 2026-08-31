import { apiClient, ApiError } from "./api.service";
import { ApiResponse, GameResultsDetail, MatchHistoryItem } from "@types";

/**
 * Turn whatever went wrong into the error the player should read.
 *
 * Deliberately mirrors `game.service.ts` and `auth.service.ts`; the three
 * should read alike. `fallback` is for a failure with nothing to say.
 */
const asUserFacingError = (error: unknown, fallback: string): Error => {
  // ApiError extends Error, so it has to be narrowed first.
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return new Error("Server error. Please try again later.");
    }
    return new Error(error.message || fallback);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
};

export class HistoryService {
  /** The caller's own finished games, newest first. */
  async getHistory(): Promise<MatchHistoryItem[]> {
    const fallback = "Could not load your match history. Please try again.";
    try {
      const { success, data, error } = await apiClient.get<
        ApiResponse<MatchHistoryItem[]>
      >("/api/game/history");
      if (!success || !data) {
        console.error("Loading match history failed:", error);
        throw new Error(error || fallback);
      }
      return data;
    } catch (error) {
      console.error("Error loading match history:", error);
      throw asUserFacingError(error, fallback);
    }
  }

  /**
   * One finished game, round by round.
   *
   * The route is members-only and answers 403 for a game that does not exist
   * and one the caller was never in alike, so a rejection here never means the
   * game is missing.
   */
  async getResults(gameId: string): Promise<GameResultsDetail> {
    const fallback = "Could not load that game's results. Please try again.";
    try {
      const { success, data, error } = await apiClient.get<
        ApiResponse<GameResultsDetail>
      >(`/api/game/${gameId}/results`);
      if (!success || !data) {
        console.error("Loading game results failed:", error);
        throw new Error(error || fallback);
      }
      return data;
    } catch (error) {
      console.error("Error loading game results:", error);
      throw asUserFacingError(error, fallback);
    }
  }
}

export const historyService = new HistoryService();
