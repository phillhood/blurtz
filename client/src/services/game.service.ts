import { apiClient } from "./api.service";
import { ApiResponse, CreateGameRequest, Game, JoinGameRequest } from "@types";

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
    try {
      const { success, data, error } = await apiClient.post<ApiResponse<Game>>(
        "/api/game",
        payload
      );
      if (!success || !data) {
        console.error("Game creation failed:", error);
        throw new Error("Game creation failed. Please try again.");
      }
      return data;
    } catch (error) {
      console.error("Error creating game:", error);
      throw new Error("Failed to create game. Please try again later.");
    }
  }
  async joinGame(payload: JoinGameRequest): Promise<Game> {
    try {
      let path = "";
      const { id, alias } = payload;
      if (id) {
        path = `/api/game/joinById`;
      } else if (alias) {
        path = `/api/game/joinByCode`;
      }
      const { success, data, error } = await apiClient.post<ApiResponse<Game>>(
        path,
        payload
      );
      if (!success || !data) {
        console.error("Joining game by code failed:", error);
        throw new Error("Joining game by code failed. Please try again.");
      }
      return data;
    } catch (error) {
      console.error("Error joining game by code:", error);
      throw new Error("Failed to join game by code. Please try again later.");
    }
  }

  async leaveGame(gameId: string): Promise<void> {
    return apiClient.post(`/api/game/${gameId}/leave`);
  }
}

export const gameService = new GameService();
