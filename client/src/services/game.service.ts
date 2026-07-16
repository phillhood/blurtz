import { apiClient, ApiError } from "./api.service";
import { ApiResponse, CreateGameRequest, Game, JoinGameRequest } from "@types";

/**
 * Turn whatever went wrong into the error the player should read.
 *
 * `api.service` parses a refused request's Nest error body into an `ApiError`
 * whose `message` is the server's own (joining ValidationPipe's array) - so
 * surface that rather than a fixed string, which would name nothing the player
 * can act on. `fallback` is for a failure with nothing to say.
 *
 * Deliberately mirrors `auth.service.ts`; the two should read alike.
 */
const asUserFacingError = (error: unknown, fallback: string): Error => {
  // ApiError extends Error, so it has to be narrowed first.
  if (error instanceof ApiError) {
    // A 5xx is the server falling over, not the player getting it wrong. Its
    // message is an internal detail and not the player's to read.
    if (error.status >= 500) {
      return new Error("Server error. Please try again later.");
    }
    return new Error(error.message || fallback);
  }
  // A message this module raised itself (the envelope said `success: false`),
  // or a network failure. Both already say what they mean.
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
};

export class GameService {
  async getActiveGames(): Promise<Game[]> {
    const { success, data, error } = await apiClient.get<ApiResponse<Game[]>>(
      "/api/game/active"
    );
    if (!success || !data) {
      console.error("Game creation failed:", error);
      throw new Error("Game creation failed. Please try again.");
    }
    return data;
  }
  async getAvailableGames(): Promise<Game[]> {
    const { success, data, error } = await apiClient.get<ApiResponse<Game[]>>(
      "/api/game/listings"
    );
    if (!success || !data) {
      console.error("Game creation failed:", error);
      throw new Error("Game creation failed. Please try again.");
    }
    return data;
  }
  async createGame(payload: CreateGameRequest): Promise<Game> {
    const fallback = "Failed to create game. Please try again later.";
    try {
      const { success, data, error } = await apiClient.post<ApiResponse<Game>>(
        "/api/game",
        payload
      );
      if (!success || !data) {
        console.error("Game creation failed:", error);
        throw new Error(error || fallback);
      }
      return data;
    } catch (error) {
      console.error("Error creating game:", error);
      throw asUserFacingError(error, fallback);
    }
  }
  async joinGame(payload: JoinGameRequest): Promise<Game> {
    const fallback = "Failed to join game. Please try again later.";
    const { id, alias } = payload;

    // The two join routes are not interchangeable, and with neither an id nor
    // an alias there is no route at all - refuse rather than POST to the API
    // root, which the caller would read as a join failure.
    const path = id
      ? `/api/game/joinById`
      : alias
        ? `/api/game/joinByCode`
        : null;
    if (!path) {
      throw new Error("Cannot join a game without an id or an invite code.");
    }

    try {
      const { success, data, error } = await apiClient.post<ApiResponse<Game>>(
        path,
        payload
      );
      if (!success || !data) {
        console.error("Joining game failed:", error);
        throw new Error(error || fallback);
      }
      return data;
    } catch (error) {
      console.error("Error joining game:", error);
      throw asUserFacingError(error, fallback);
    }
  }

  async leaveGame(gameId: string): Promise<void> {
    return apiClient.post(`/api/game/${gameId}/leave`);
  }
}

export const gameService = new GameService();
