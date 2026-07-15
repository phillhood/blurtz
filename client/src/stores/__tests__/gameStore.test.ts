import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore } from "../gameStore";
import { socketService, SocketCallbacks } from "@services/socket.service";
import { GameState } from "@types";

vi.mock("@services/socket.service", () => ({
  socketService: {
    setCallbacks: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    moveCard: vi.fn(),
    connected: true,
  },
}));

const gameState = (id: string) => ({ id, status: "playing" }) as GameState;

/**
 * Grab the callbacks the store registered with the socket service, so they can
 * be invoked the way a real server event would.
 */
async function registeredCallbacks(): Promise<SocketCallbacks> {
  await useGameStore.getState().initializeSocket("user-1", "token");
  const setCallbacks = socketService.setCallbacks as unknown as {
    mock: { calls: SocketCallbacks[][] };
  };
  return setCallbacks.mock.calls[0][0];
}

describe("gameStore", () => {
  beforeEach(() => {
    useGameStore.setState({
      gameState: null,
      currentGameId: null,
      connected: false,
      socketInitialized: false,
      error: null,
      userJoined: false,
      userLeft: false,
    });
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------
  // Task 5 item 4: a rejected move must resolve the board, not freeze it.
  //
  // The gateway used to answer a rejected move with a bare ERROR carrying no
  // state. The store's gameState object identity never changed, so <Game>'s
  // effect on [gameState] never fired, pendingMoveCardIds was never cleared,
  // and the card sat at opacity: 0 - invisible, but still in the pile.
  // ---------------------------------------------------------------------
  describe("onMoveRejected", () => {
    it("swaps in the state the server sent back", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ gameState: gameState("game-1") });
      const before = useGameStore.getState().gameState;

      const rejectedState = gameState("game-1");
      callbacks.onMoveRejected!({
        gameState: rejectedState,
        reason: "That card no longer fits on that bank pile",
      });

      const after = useGameStore.getState().gameState;
      expect(after).toBe(rejectedState);
      // The crux: a NEW object. Identity is what wakes the board up and lets
      // it un-hide the card that never moved.
      expect(after).not.toBe(before);
    });

    it("surfaces the reason as a transient error", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "That card no longer fits on that bank pile",
      });

      expect(useGameStore.getState().error).toBe(
        "That card no longer fits on that bank pile"
      );
    });

    it("does not treat a rejected move as a fatal 'game not found'", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ currentGameId: "game-1" });

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "That card no longer fits on that bank pile",
      });

      // Losing a race is routine - it must not tear the player out of the game.
      expect(useGameStore.getState().currentGameId).toBe("game-1");
    });
  });

  describe("onCardMoved", () => {
    it("replaces state wholesale and clears any previous error", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ error: "an earlier rejection" });

      const movedState = gameState("game-1");
      callbacks.onCardMoved!(movedState);

      expect(useGameStore.getState().gameState).toBe(movedState);
      expect(useGameStore.getState().error).toBeNull();
    });
  });
});
