import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  gameKeys,
  useGameListings,
  useActiveGames,
  useCreateGame,
  useJoinGameById,
  useJoinGameByCode,
} from "../useGamesQuery";
import { gameService } from "@services/game.service";
import { Game } from "@types";

vi.mock("@services/game.service", () => ({
  gameService: {
    getAvailableGames: vi.fn(),
    getActiveGames: vi.fn(),
    createGame: vi.fn(),
    joinGame: vi.fn(),
  },
}));

// A fixed createdAt, so two calls for the same id are equal.
const game = (id: string): Game =>
  ({
    id,
    name: `Game ${id}`,
    alias: `alias-${id}`,
    status: "waiting",
    maxPlayers: 4,
    currentPlayers: 1,
    createdAt: new Date(2024, 0, 3),
  }) as Game;

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("gameKeys", () => {
  it("nests every key under the one root the store invalidates", () => {
    // gameStore.leaveGame invalidates `gameKeys.all`. Any key that does not
    // start with it is a cache that a leave silently leaves stale.
    for (const key of [
      gameKeys.listings(),
      gameKeys.active("user-1"),
      gameKeys.detail("game-1"),
    ]) {
      expect(key.slice(0, gameKeys.all.length)).toEqual([...gameKeys.all]);
    }
  });

  it("keys active games per user", () => {
    // Two users on one machine must not read each other's active games out of
    // the cache.
    expect(gameKeys.active("user-1")).not.toEqual(gameKeys.active("user-2"));
  });
});

describe("useGamesQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  });

  describe("useGameListings", () => {
    it("returns the lobby listings", async () => {
      vi.mocked(gameService.getAvailableGames).mockResolvedValue([game("game-1")]);

      const { result } = renderHook(() => useGameListings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([game("game-1")]);
    });

    it("surfaces a failure rather than an empty lobby", async () => {
      // An error swallowed into `data: []` renders "No games available",
      // which tells the player the lobby is empty when it is unreachable.
      vi.mocked(gameService.getAvailableGames).mockRejectedValue(
        new Error("Network error")
      );

      const { result } = renderHook(() => useGameListings(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toEqual(new Error("Network error"));
    });
  });

  describe("useActiveGames", () => {
    it("waits for a user id before asking whose games these are", async () => {
      const { result } = renderHook(() => useActiveGames(undefined), { wrapper });

      // /api/game/active is derived from the JWT, but firing it before the
      // profile lands wastes a request against a 3/sec-per-IP throttler on
      // every dashboard mount.
      expect(result.current.fetchStatus).toBe("idle");
      expect(gameService.getActiveGames).not.toHaveBeenCalled();
    });

    it("fetches once there is a user", async () => {
      vi.mocked(gameService.getActiveGames).mockResolvedValue([game("game-9")]);

      const { result } = renderHook(() => useActiveGames("user-1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([game("game-9")]);
    });
  });

  describe("useCreateGame", () => {
    it("creates the game and refreshes the listings behind it", async () => {
      vi.mocked(gameService.createGame).mockResolvedValue(game("game-new"));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateGame(), { wrapper });
      await result.current.mutateAsync({
        name: "Friday",
        maxPlayers: 2,
        isPrivate: false,
      });

      expect(gameService.createGame).toHaveBeenCalledWith({
        name: "Friday",
        maxPlayers: 2,
        isPrivate: false,
      });
      // Without this the creator's own new game is missing from the lobby they
      // are looking at.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: gameKeys.listings() });
    });

    it("does not refresh anything when the create failed", async () => {
      vi.mocked(gameService.createGame).mockRejectedValue(new Error("nope"));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateGame(), { wrapper });
      await expect(
        result.current.mutateAsync({ name: "", maxPlayers: 2, isPrivate: false })
      ).rejects.toThrow("nope");

      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe("useJoinGameById", () => {
    it("joins by id and refreshes both lists", async () => {
      vi.mocked(gameService.joinGame).mockResolvedValue(game("game-1"));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useJoinGameById(), { wrapper });
      await result.current.mutateAsync("game-1");

      expect(gameService.joinGame).toHaveBeenCalledWith({ id: "game-1" });
      // `all`, not `listings`: joining moves the game from the available list
      // into the player's own, so both are now wrong.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: gameKeys.all });
    });
  });

  describe("useJoinGameByCode", () => {
    it("joins by alias and refreshes both lists", async () => {
      vi.mocked(gameService.joinGame).mockResolvedValue(game("game-2"));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useJoinGameByCode(), { wrapper });
      await result.current.mutateAsync("happy-blue-cat");

      // `alias`, which is what routes to joinByCode rather than joinById.
      expect(gameService.joinGame).toHaveBeenCalledWith({ alias: "happy-blue-cat" });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: gameKeys.all });
    });

    it("does not refresh anything when the code was wrong", async () => {
      vi.mocked(gameService.joinGame).mockRejectedValue(new Error("Game not found"));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useJoinGameByCode(), { wrapper });
      await expect(result.current.mutateAsync("nope")).rejects.toThrow(
        "Game not found"
      );

      expect(invalidate).not.toHaveBeenCalled();
    });
  });
});
