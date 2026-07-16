import { describe, it, expect, beforeEach, vi } from "vitest";
import { SOCKET_EVENTS } from "@blurtz/shared";
import { GameState } from "@types";

/**
 * The socket service's SUBSCRIPTIONS, not its emits.
 *
 * A callback declared on `SocketCallbacks` and implemented in `gameStore` is
 * dead code unless `setupEventListeners` actually registers a handler for the
 * event that should call it - and `GAME_ENDED` was exactly that: implemented
 * on both ends, wired to nothing in between, so winning a game was invisible
 * until the player reloaded. Nothing in the type system connects those two
 * halves, so this file asserts the connection.
 *
 * `socket.io-client` is faked at the module boundary and its `io()` returns a
 * socket that records every handler registered on it. The real `socketService`
 * and the real `gameStore` run: firing a recorded handler is exactly what the
 * real socket does when a frame arrives, so a test that fires one drives the
 * whole path an event takes from the wire to the store.
 */

type Handler = (...args: unknown[]) => void;

const handlers = new Map<string, Handler>();

const fakeSocket = {
  connected: false,
  id: "socket-1",
  on: vi.fn((event: string, handler: Handler) => {
    handlers.set(event, handler);
  }),
  connect: vi.fn(() => {
    fakeSocket.connected = true;
    handlers.get("connect")?.();
  }),
  emit: vi.fn(),
  close: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => fakeSocket),
}));

const { socketService } = await import("@services/socket.service");
const { useGameStore } = await import("@stores/gameStore");

const finishedState = (winner: string) =>
  ({ id: "game-1", status: "finished", winner }) as GameState;

describe("socketService subscriptions", () => {
  beforeEach(() => {
    handlers.clear();
    fakeSocket.connected = false;
    vi.clearAllMocks();
    socketService.disconnect();
    useGameStore.setState({ gameState: null, socketInitialized: false, error: null });
  });

  it("registers a handler for every event the store implements a callback for", async () => {
    await socketService.connect("token");

    // Not an exhaustive list of SOCKET_EVENTS - the outbound ones (join_room,
    // move_card, ...) are emitted, never listened for. These are the inbound
    // ones the store has a callback for, and each one must be reachable.
    for (const event of [
      SOCKET_EVENTS.ROOM_JOINED,
      SOCKET_EVENTS.ROOM_LEFT,
      SOCKET_EVENTS.GAME_STATE_UPDATED,
      SOCKET_EVENTS.GAME_STARTED,
      SOCKET_EVENTS.GAME_ENDED,
      SOCKET_EVENTS.PLAYER_JOINED,
      SOCKET_EVENTS.PLAYER_LEFT,
      SOCKET_EVENTS.CARD_MOVED,
      SOCKET_EVENTS.MOVE_REJECTED,
      SOCKET_EVENTS.CARD_FLIPPED,
      SOCKET_EVENTS.BLITZ_CALLED,
      SOCKET_EVENTS.ROUND_OVER,
      SOCKET_EVENTS.ROUND_STARTED,
      SOCKET_EVENTS.ERROR,
    ]) {
      expect(handlers.has(event), `no handler for "${event}"`).toBe(true);
    }
  });

  it("calls onGameEnded when the server ends the game", async () => {
    const onGameEnded = vi.fn();
    socketService.setCallbacks({ onGameEnded });
    await socketService.connect("token");

    const payload = {
      gameState: finishedState("player-1"),
      reason: "blitz",
      winnerId: "player-1",
      scores: { "player-1": 6 },
      calledBy: "player-1",
    };
    handlers.get(SOCKET_EVENTS.GAME_ENDED)!(payload);

    expect(onGameEnded).toHaveBeenCalledWith(payload);
  });

  // The whole point: a game_ended frame off the wire must land in the store,
  // because that is what the "Game finished!" heading renders from.
  it("delivers a game_ended frame all the way to the game store", async () => {
    await useGameStore.getState().initializeSocket("user-1", "token");

    const state = finishedState("player-1");
    handlers.get(SOCKET_EVENTS.GAME_ENDED)!({
      gameState: state,
      reason: "blitz",
      winnerId: "player-1",
    });

    expect(useGameStore.getState().gameState).toBe(state);
  });

  // The forfeit path sends a different shape - `winner` (a Player, possibly
  // undefined) instead of `winnerId`, and no scores. The store must not care.
  it("delivers a forfeit game_ended frame with no winner", async () => {
    await useGameStore.getState().initializeSocket("user-1", "token");

    const state = { id: "game-1", status: "finished", winner: null } as GameState;
    handlers.get(SOCKET_EVENTS.GAME_ENDED)!({
      gameState: state,
      reason: "forfeit",
      winner: undefined,
    });

    expect(useGameStore.getState().gameState).toBe(state);
  });
});
