import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useGames } from "../useGames";
import { gameService } from "@services/game.service";

// Mock the game service
vi.mock("@services/game.service", () => ({
  gameService: {
    getAvailableGames: vi.fn(),
    getActiveGames: vi.fn(),
  },
}));

// Mock the auth store
vi.mock("@stores", () => ({
  useAuthStore: vi.fn((selector) =>
    selector({ user: { id: "user-1", username: "testuser" } })
  ),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useGames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return loading state initially", () => {
    vi.mocked(gameService.getAvailableGames).mockReturnValue(
      new Promise(() => {}) // Never resolves
    );
    vi.mocked(gameService.getActiveGames).mockReturnValue(
      new Promise(() => {})
    );

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.availableGames).toEqual([]);
    expect(result.current.activeGames).toEqual([]);
  });

  it("should fetch and return available games", async () => {
    const mockGames = [
      { id: "1", name: "Game 1", status: "waiting" as const, alias: "abc123", maxPlayers: 4, currentPlayers: 1, createdAt: new Date() },
      { id: "2", name: "Game 2", status: "waiting" as const, alias: "def456", maxPlayers: 4, currentPlayers: 2, createdAt: new Date() },
    ];

    vi.mocked(gameService.getAvailableGames).mockResolvedValue(mockGames);
    vi.mocked(gameService.getActiveGames).mockResolvedValue([]);

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.availableGames).toEqual(mockGames);
    expect(result.current.error).toBeNull();
  });

  it("should fetch and return active games", async () => {
    const mockActiveGames = [
      { id: "1", name: "Active Game", status: "playing" as const, alias: "ghi789", maxPlayers: 4, currentPlayers: 3, createdAt: new Date() },
    ];

    vi.mocked(gameService.getAvailableGames).mockResolvedValue([]);
    vi.mocked(gameService.getActiveGames).mockResolvedValue(mockActiveGames);

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.activeGames).toEqual(mockActiveGames);
  });

  it("should handle errors", async () => {
    vi.mocked(gameService.getAvailableGames).mockRejectedValue(
      new Error("Network error")
    );
    vi.mocked(gameService.getActiveGames).mockResolvedValue([]);

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("should provide refetch function", async () => {
    vi.mocked(gameService.getAvailableGames).mockResolvedValue([]);
    vi.mocked(gameService.getActiveGames).mockResolvedValue([]);

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe("function");

    // Trigger refetch
    await result.current.refetch();

    // Should have called the service again
    expect(gameService.getAvailableGames).toHaveBeenCalledTimes(2);
  });

  it("should return empty arrays when no games", async () => {
    vi.mocked(gameService.getAvailableGames).mockResolvedValue([]);
    vi.mocked(gameService.getActiveGames).mockResolvedValue([]);

    const { result } = renderHook(() => useGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.availableGames).toEqual([]);
    expect(result.current.activeGames).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
