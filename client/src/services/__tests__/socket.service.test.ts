import { describe, it, expect, beforeEach, vi } from "vitest";
import { SOCKET_EVENTS, SOCKET_ERROR_CODES } from "@blurtz/shared";
import { GameState } from "@types";

/**
 * The socket service's SUBSCRIPTIONS, not its emits.
 *
 * A callback declared on `SocketCallbacks` and implemented in `gameStore` is
 * dead code unless `setupEventListeners` registers a handler for the event that
 * should call it. Nothing in the type system connects those two halves, so this
 * file asserts the connection.
 *
 * `socket.io-client` is faked at the module boundary; its `io()` returns a
 * socket that records every handler registered on it. The real `socketService`
 * and `gameStore` run, so firing a recorded handler drives the whole path an
 * event takes from the wire to the store.
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

  it("unwraps each inbound frame to the shape the store's callback expects", async () => {
    const callbacks = {
      onGameJoined: vi.fn(),
      onGameLeft: vi.fn(),
      onGameStateUpdated: vi.fn(),
      onGameStarted: vi.fn(),
      onCardMoved: vi.fn(),
      onCardFlipped: vi.fn(),
    };
    socketService.setCallbacks(callbacks);
    await socketService.connect("token");

    const state = { id: "game-1", status: "playing" } as GameState;

    // Each of these arrives wrapped as `{ gameState }` and the store's
    // callback takes the bare state. Handing the wrapper through instead would
    // set `gameState` to `{ gameState: ... }` and every read off it would be
    // undefined.
    handlers.get(SOCKET_EVENTS.ROOM_JOINED)!({ gameState: state });
    expect(callbacks.onGameJoined).toHaveBeenCalledWith(state);

    handlers.get(SOCKET_EVENTS.GAME_STATE_UPDATED)!({ gameState: state });
    expect(callbacks.onGameStateUpdated).toHaveBeenCalledWith(state);

    handlers.get(SOCKET_EVENTS.GAME_STARTED)!({ gameState: state });
    expect(callbacks.onGameStarted).toHaveBeenCalledWith(state);

    handlers.get(SOCKET_EVENTS.CARD_MOVED)!({ gameState: state });
    expect(callbacks.onCardMoved).toHaveBeenCalledWith(state);

    handlers.get(SOCKET_EVENTS.CARD_FLIPPED)!({ gameState: state });
    expect(callbacks.onCardFlipped).toHaveBeenCalledWith(state);

    // ROOM_LEFT is the odd one out: it carries an id, not a state.
    handlers.get(SOCKET_EVENTS.ROOM_LEFT)!({ gameId: "game-1" });
    expect(callbacks.onGameLeft).toHaveBeenCalledWith("game-1");
  });

  it("passes the whole payload through for the frames that carry more than state", async () => {
    const callbacks = {
      onMoveRejected: vi.fn(),
      onRoundOver: vi.fn(),
      onBlitzCalled: vi.fn(),
      onPlayerJoined: vi.fn(),
      onPlayerLeft: vi.fn(),
    };
    socketService.setCallbacks(callbacks);
    await socketService.connect("token");

    const state = { id: "game-1", status: "playing" } as GameState;

    // These callbacks read a sibling field off the payload - the reason, the
    // round number, who called it - so unwrapping to the bare state would
    // throw the very thing the callback exists to read.
    const rejection = { gameState: state, reason: "Destination pile not found" };
    handlers.get(SOCKET_EVENTS.MOVE_REJECTED)!(rejection);
    expect(callbacks.onMoveRejected).toHaveBeenCalledWith(rejection);

    const roundOver = { gameState: state, round: 2, calledBy: "player-1" };
    handlers.get(SOCKET_EVENTS.ROUND_OVER)!(roundOver);
    expect(callbacks.onRoundOver).toHaveBeenCalledWith(roundOver);

    handlers.get(SOCKET_EVENTS.BLITZ_CALLED)!({ playerId: "player-1" });
    expect(callbacks.onBlitzCalled).toHaveBeenCalledWith({
      playerId: "player-1",
    });

    handlers.get(SOCKET_EVENTS.PLAYER_JOINED)!({ userId: "user-2" });
    expect(callbacks.onPlayerJoined).toHaveBeenCalledWith({ userId: "user-2" });

    handlers.get(SOCKET_EVENTS.PLAYER_LEFT)!({ userId: "user-2" });
    expect(callbacks.onPlayerLeft).toHaveBeenCalledWith({ userId: "user-2" });
  });

  it("routes a server error frame to onError with its code and message", async () => {
    const onError = vi.fn();
    socketService.setCallbacks({ onError });
    await socketService.connect("token");

    handlers.get(SOCKET_EVENTS.ERROR)!({
      code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
      message: "Game not found",
    });

    // The code is the only thing downstream is allowed to classify on. Dropping
    // it here would leave every server error looking client-raised.
    expect(onError).toHaveBeenCalledWith({
      code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
      message: "Game not found",
    });
  });

  it("reports a codeless error frame as having no code, not as a missing field", async () => {
    const onError = vi.fn();
    socketService.setCallbacks({ onError });
    await socketService.connect("token");

    handlers.get(SOCKET_EVENTS.ERROR)!({ message: "something broke" });

    expect(onError).toHaveBeenCalledWith({ code: null, message: "something broke" });
  });

  it("reports a disconnect with the reason socket.io gave", async () => {
    const onDisconnect = vi.fn();
    socketService.setCallbacks({ onDisconnect });
    await socketService.connect("token");

    handlers.get("disconnect")!("transport close");

    expect(onDisconnect).toHaveBeenCalledWith("transport close");
    expect(socketService.connected).toBe(false);
  });
});

/**
 * The emits. Every one of these is a player action that must reach the server
 * under the name the gateway listens for, carrying the ids the gateway reads.
 */
describe("socketService emits", () => {
  beforeEach(() => {
    handlers.clear();
    fakeSocket.connected = false;
    vi.clearAllMocks();
    socketService.disconnect();
  });

  it("sends each player action under the event name the gateway listens for", async () => {
    await socketService.connect("token");

    socketService.joinGame("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.JOIN_ROOM, {
      gameId: "game-1",
    });

    socketService.leaveGame("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.LEAVE_ROOM, {
      gameId: "game-1",
    });

    socketService.startGame("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.START_GAME, {
      gameId: "game-1",
    });

    socketService.callBlitz("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.CALL_BLITZ, {
      gameId: "game-1",
    });

    socketService.forfeitGame("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.FORFEIT_GAME, {
      gameId: "game-1",
    });

    socketService.flipCard("game-1", "pile-a");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.FLIP_CARD, {
      gameId: "game-1",
      pileId: "pile-a",
    });

    socketService.playerReady("game-1", true);
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.PLAYER_READY, {
      gameId: "game-1",
      isReady: true,
    });
  });

  it("sends a move with every id the gateway needs to validate it", async () => {
    await socketService.connect("token");

    socketService.moveCard("game-1", "card-1", "pile-a", "pile-b");

    // No playerId: the gateway derives the actor from the authenticated
    // socket. Every other field is one the server cannot guess.
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.MOVE_CARD, {
      gameId: "game-1",
      cardId: "card-1",
      fromPileId: "pile-a",
      toPileId: "pile-b",
    });
  });

  it("refuses to pretend an action was sent when there is no socket", () => {
    // Never connected. Each of these must throw rather than no-op: the store
    // catches the throw and puts it on `error`, which is the only way the
    // player learns their click went nowhere.
    expect(() => socketService.joinGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.leaveGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.startGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.callBlitz("game-1")).toThrow("Socket not connected");
    expect(() => socketService.forfeitGame("game-1")).toThrow(
      "Socket not connected"
    );
    expect(() => socketService.flipCard("game-1", "pile-a")).toThrow(
      "Socket not connected"
    );
    expect(() => socketService.playerReady("game-1", true)).toThrow(
      "Socket not connected"
    );
    expect(() =>
      socketService.moveCard("game-1", "card-1", "pile-a", "pile-b")
    ).toThrow("Socket not connected");
    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });

  it("refuses to send an action on a socket that exists but has dropped", async () => {
    await socketService.connect("token");
    // The socket object is still there; the transport is gone. This is the
    // state a player is in mid-reconnect, and an emit here vanishes silently.
    fakeSocket.connected = false;
    vi.mocked(fakeSocket.emit).mockClear();

    expect(() =>
      socketService.moveCard("game-1", "card-1", "pile-a", "pile-b")
    ).toThrow("Socket not connected");

    // forfeitGame checked only `!this.socket` where every sibling checks
    // `!this.socket?.connected`, so on a dropped-but-present socket it alone
    // emitted into socket.io's buffer and told the caller it had gone through.
    expect(() => socketService.forfeitGame("game-1")).toThrow(
      "Socket not connected"
    );

    // The rest of the family, so the odd one out cannot come back unnoticed.
    expect(() => socketService.joinGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.leaveGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.startGame("game-1")).toThrow("Socket not connected");
    expect(() => socketService.callBlitz("game-1")).toThrow("Socket not connected");
    expect(() => socketService.flipCard("game-1", "pile-a")).toThrow(
      "Socket not connected"
    );
    expect(() => socketService.playerReady("game-1", true)).toThrow(
      "Socket not connected"
    );

    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });

  it("does not throw an auto-rejoin at the user", async () => {
    await socketService.connect("token");
    fakeSocket.connected = false;
    vi.mocked(fakeSocket.emit).mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Auto-rejoin is speculative - it fires on reconnect without anyone asking
    // for it. Throwing would surface an error for something the player never
    // did, so this one alone warns and gives up.
    expect(() => socketService.autoRejoinGame("game-1")).not.toThrow();
    expect(fakeSocket.emit).not.toHaveBeenCalled();

    fakeSocket.connected = true;
    socketService.autoRejoinGame("game-1");
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.JOIN_ROOM, {
      gameId: "game-1",
    });
    warn.mockRestore();
  });
});

describe("socketService connection", () => {
  beforeEach(() => {
    handlers.clear();
    fakeSocket.connected = false;
    vi.clearAllMocks();
    socketService.disconnect();
  });

  it("hands the token to the handshake", async () => {
    const { io } = await import("socket.io-client");
    await socketService.connect("a-real-jwt");

    // The server reads this to authenticate the connection; a socket that
    // connects without it is anonymous.
    expect(vi.mocked(io).mock.calls[0][1]).toMatchObject({
      auth: { token: "a-real-jwt" },
    });
  });

  it("reuses the live socket instead of opening a second one", async () => {
    const { io } = await import("socket.io-client");
    const first = await socketService.connect("token");
    const second = await socketService.connect("token");

    // Two sockets means two rooms and duplicated events - and the second
    // handshake would orphan the first, dropping the player out of the game.
    expect(second).toBe(first);
    expect(vi.mocked(io)).toHaveBeenCalledTimes(1);
  });

  it("reports a refused connection and stays retryable", async () => {
    const onError = vi.fn();
    socketService.setCallbacks({ onError });
    // A connect that never completes, so `connect_error` is what settles it.
    vi.mocked(fakeSocket.connect).mockImplementationOnce(() => {});

    const attempt = socketService.connect("token");
    handlers.get("connect_error")!(new Error("xhr poll error"));

    await expect(attempt).rejects.toThrow("xhr poll error");
    expect(onError).toHaveBeenCalledWith({
      code: null,
      message: "Failed to connect to game server",
    });
    expect(socketService.connected).toBe(false);

    // The in-flight promise has to be released or every later attempt would
    // return this same rejected one forever.
    vi.mocked(fakeSocket.connect).mockImplementation(() => {
      fakeSocket.connected = true;
      handlers.get("connect")?.();
    });
    await expect(socketService.connect("token")).resolves.toBeDefined();
  });

  it("forgets its callbacks on disconnect", async () => {
    const onGameStateUpdated = vi.fn();
    socketService.setCallbacks({ onGameStateUpdated });
    await socketService.connect("token");

    socketService.disconnect();

    expect(fakeSocket.removeAllListeners).toHaveBeenCalled();
    expect(fakeSocket.close).toHaveBeenCalled();
    expect(socketService.connected).toBe(false);
    // A logout must not leave the previous user's store callbacks wired to the
    // next user's socket.
    expect(socketService.socketId).toBeUndefined();
  });

  it("merges callbacks rather than replacing the set", async () => {
    // gameStore registers one big object, but tests and future call sites
    // register partials. A replacing setter would silently unwire everything
    // registered before it.
    const onConnect = vi.fn();
    const onGameStateUpdated = vi.fn();
    socketService.setCallbacks({ onConnect });
    socketService.setCallbacks({ onGameStateUpdated });

    await socketService.connect("token");
    handlers.get(SOCKET_EVENTS.GAME_STATE_UPDATED)!({
      gameState: { id: "game-1" } as GameState,
    });

    expect(onConnect).toHaveBeenCalled();
    expect(onGameStateUpdated).toHaveBeenCalled();
  });

  it("reports itself connected only when the transport agrees", async () => {
    expect(socketService.connected).toBe(false);

    await socketService.connect("token");
    expect(socketService.connected).toBe(true);
    expect(socketService.socketId).toBe("socket-1");

    fakeSocket.connected = false;
    // The internal flag still says connected; the socket disagrees. The getter
    // must believe the socket - this is what every emit guard reads.
    expect(socketService.connected).toBe(false);
  });
});
