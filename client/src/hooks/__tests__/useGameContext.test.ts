import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameContext } from "../useGameContext";
import { useAuthStore, useGameStore } from "@stores";
import { GameState, User } from "@types";

vi.mock("@services/socket.service", () => ({
  socketService: {
    setCallbacks: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    joinGame: vi.fn(),
    leaveGame: vi.fn(),
    forfeitGame: vi.fn(),
    moveCard: vi.fn(),
    flipCard: vi.fn(),
    callBlitz: vi.fn(),
    playerReady: vi.fn(),
    startGame: vi.fn(),
    connected: true,
  },
}));

vi.mock("@services/game.service", () => ({
  gameService: { createGame: vi.fn() },
}));

const { socketService } = await import("@services/socket.service");

const ada = { id: "user-1", username: "ada" } as User;

const inGame = () =>
  ({
    id: "game-1",
    status: "playing",
    players: [
      {
        id: "player-1",
        user: { id: "user-1", username: "ada" },
        deck: { drawPile: { id: "draw-1" } },
      },
    ],
  }) as unknown as GameState;

/**
 * The hook that injects the signed-in user into every store action.
 *
 * The guards are the subject: every wrapper refuses to act when there is nobody
 * to act as. Without them a component rendering early - before the profile
 * lands, or after a logout - emits an action with `undefined` where an id
 * belongs.
 */
describe("useGameContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (socketService as { connected: boolean }).connected = true;
    useAuthStore.setState({ user: ada });
    useGameStore.setState({
      gameState: null,
      currentGameId: null,
      connected: true,
      socketInitialized: false,
      error: null,
      moveRejection: null,
      userJoined: false,
      userLeft: false,
    });
  });

  it("resolves the current player from the signed-in user", () => {
    useGameStore.setState({ gameState: inGame() });

    const { result } = renderHook(() => useGameContext());

    expect(result.current.currentPlayer?.id).toBe("player-1");
  });

  it("has no current player when the user is not in this game", () => {
    useAuthStore.setState({ user: { id: "user-99", username: "bob" } as User });
    useGameStore.setState({ gameState: inGame() });

    const { result } = renderHook(() => useGameContext());

    expect(result.current.currentPlayer).toBeNull();
  });

  it("joins with the signed-in user's id", () => {
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.joinGame("game-1"));

    expect(socketService.joinGame).toHaveBeenCalledWith("game-1");
    expect(useGameStore.getState().currentGameId).toBe("game-1");
  });

  it("does not join when nobody is signed in", () => {
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.joinGame("game-1"));

    expect(socketService.joinGame).not.toHaveBeenCalled();
    // Not even an error: there is nothing to report to a user who is gone.
    expect(useGameStore.getState().error).toBeNull();
  });

  it("creates a game as the signed-in user", async () => {
    const { gameService } = await import("@services/game.service");
    vi.mocked(gameService.createGame).mockResolvedValue({ id: "game-new" } as never);
    const { result } = renderHook(() => useGameContext());

    let created: unknown;
    await act(async () => {
      created = await result.current.createAndJoinGame("Friday", 2, false, 100);
    });

    expect(created).toEqual({ id: "game-new" });
    expect(socketService.joinGame).toHaveBeenCalledWith("game-new");
  });

  it("creates nothing when nobody is signed in", async () => {
    const { gameService } = await import("@services/game.service");
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => useGameContext());

    let created: unknown = "unset";
    await act(async () => {
      created = await result.current.createAndJoinGame("Friday", 2, false, 100);
    });

    expect(created).toBeNull();
    expect(gameService.createGame).not.toHaveBeenCalled();
  });

  it("leaves as the signed-in user, and forfeits only when told to", () => {
    useGameStore.setState({
      gameState: { id: "game-1", status: "waiting" } as GameState,
      currentGameId: "game-1",
    });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.leaveGame());
    expect(socketService.leaveGame).toHaveBeenCalledWith("game-1");

    useGameStore.setState({ gameState: inGame(), currentGameId: "game-1" });
    act(() => result.current.leaveGame(true));
    expect(socketService.forfeitGame).toHaveBeenCalledWith("game-1");
  });

  it("does not leave when nobody is signed in", () => {
    useGameStore.setState({ currentGameId: "game-1" });
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.leaveGame());

    expect(socketService.leaveGame).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // The in-game actions guard on currentPlayer, not on the user: being
  // signed in is not the same as holding a seat at this table. A spectator
  // - or a player whose game state has not arrived yet - must not move.
  // ------------------------------------------------------------------
  it("plays only when the user holds a seat in this game", () => {
    useGameStore.setState({ gameState: inGame() });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.makeMove("card-1", "pile-a", "pile-b"));
    act(() => result.current.flipCard("pile-a"));
    act(() => result.current.flipDrawPile());
    act(() => result.current.callBlitz());
    act(() => result.current.playerReady(true));

    expect(socketService.moveCard).toHaveBeenCalledWith(
      "game-1",
      "card-1",
      "pile-a",
      "pile-b"
    );
    expect(socketService.flipCard).toHaveBeenCalledWith("game-1", "pile-a");
    // flipDrawPile resolves the player's OWN draw pile id locally.
    expect(socketService.flipCard).toHaveBeenCalledWith("game-1", "draw-1");
    expect(socketService.callBlitz).toHaveBeenCalledWith("game-1");
    expect(socketService.playerReady).toHaveBeenCalledWith("game-1", true);
  });

  it("refuses every in-game action for someone with no seat", () => {
    // Signed in, game loaded, but not a player in it.
    useAuthStore.setState({ user: { id: "user-99", username: "bob" } as User });
    useGameStore.setState({ gameState: inGame() });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.makeMove("card-1", "pile-a", "pile-b"));
    act(() => result.current.flipCard("pile-a"));
    act(() => result.current.flipDrawPile());
    act(() => result.current.callBlitz());
    act(() => result.current.playerReady(true));

    expect(socketService.moveCard).not.toHaveBeenCalled();
    expect(socketService.flipCard).not.toHaveBeenCalled();
    expect(socketService.callBlitz).not.toHaveBeenCalled();
    expect(socketService.playerReady).not.toHaveBeenCalled();
  });

  it("refuses every in-game action before the game state arrives", () => {
    // The frame between joining and the room answering. There is no
    // currentPlayer yet because there are no players yet.
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.makeMove("card-1", "pile-a", "pile-b"));
    act(() => result.current.flipDrawPile());
    act(() => result.current.callBlitz());

    expect(socketService.moveCard).not.toHaveBeenCalled();
    expect(socketService.flipCard).not.toHaveBeenCalled();
    expect(socketService.callBlitz).not.toHaveBeenCalled();
  });

  it("starts the game without needing a seat", () => {
    // Deliberately unguarded - the server decides who may start, and the button
    // only renders for the host.
    useGameStore.setState({ gameState: inGame() });
    const { result } = renderHook(() => useGameContext());

    act(() => result.current.startGame());

    expect(socketService.startGame).toHaveBeenCalledWith("game-1");
  });

  it("exposes the two error channels separately", () => {
    // <Game> judges fatality off `error` alone. If this hook merged them, a
    // refused move would take the board down.
    useGameStore.setState({ error: "Game not found", moveRejection: "bad pile" });

    const { result } = renderHook(() => useGameContext());

    expect(result.current.error).toBe("Game not found");
    expect(result.current.moveRejection).toBe("bad pile");

    act(() => result.current.clearMoveRejection());
    expect(useGameStore.getState().moveRejection).toBeNull();
    expect(useGameStore.getState().error).toBe("Game not found");

    act(() => result.current.clearError());
    expect(useGameStore.getState().error).toBeNull();
  });
});
