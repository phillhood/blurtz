import { apiClient, ApiError } from "./api.service";
import { ApiResponse, CreateGameRequest, Game, JoinGameRequest } from "@types";

/**
 * Turn whatever went wrong into the error the player should read.
 *
 * These two paths used to wrap their bodies in try/catch and replace the reason
 * with a fixed string, so a 400 "name must not be empty" reached the user as
 * "Failed to create game. Please try again later." - which names nothing the
 * player can act on.
 *
 * The server answers a refused request with a real HTTP status and a Nest error
 * body; `api.service` parses that into an `ApiError` whose `message` is the
 * server's own (joining ValidationPipe's array). Surface it. The generic
 * fallback is kept for what it was always for: a failure with nothing to say.
 *
 * Modelled on `auth.service.ts`, deliberately - the two should read alike.
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
    // an alias there is no route at all. `path` used to stay "" here and the
    // call POSTed to the API root - a request that means nothing and that the
    // caller would read as a join failure. Refuse it instead of sending it.
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
