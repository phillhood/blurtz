import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore } from "../gameStore";
import { socketService, SocketCallbacks } from "@services/socket.service";
import { gameService } from "@services/game.service";
import { queryClient } from "../../lib/queryClient";
import { gameKeys } from "@hooks/queries/useGamesQuery";
import { Game, GameState } from "@types";

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
    startNextRound: vi.fn(),
    // Overwritten per-test to stand in for the real getter.
    connected: true,
  },
}));

vi.mock("@services/game.service", () => ({
  gameService: {
    createGame: vi.fn(),
  },
}));

const gameState = (id: string, extra: Partial<GameState> = {}) =>
  ({ id, status: "playing", ...extra }) as GameState;

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
      moveRejection: null,
      userJoined: false,
      userLeft: false,
    });
    vi.clearAllMocks();
    (socketService as { connected: boolean }).connected = true;
    vi.mocked(socketService.connect).mockResolvedValue(
      undefined as unknown as never
    );
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

    // Task 6 item 1: the reason used to go into `error`, which <Game> greps
    // for "not found" to decide whether to replace the board with a fatal
    // error screen. Two of validateMove's own reasons match that grep, so a
    // stale pile id ejected the player from a game they could still play.
    it("surfaces the reason on the move-rejection channel, not the error channel", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "That card no longer fits on that bank pile",
      });

      expect(useGameStore.getState().moveRejection).toBe(
        "That card no longer fits on that bank pile"
      );
      // `error` is the field fatality is judged on. A refused move must never
      // reach it, whatever the server worded the reason as.
      expect(useGameStore.getState().error).toBeNull();
    });

    it("keeps a rejection reason out of `error` even when it reads like a fatal one", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "Destination pile not found",
      });

      expect(useGameStore.getState().error).toBeNull();
      expect(useGameStore.getState().moveRejection).toBe(
        "Destination pile not found"
      );
    });

    it("clears the rejection when asked, so the toast can expire", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "Destination pile not found",
      });
      useGameStore.getState().clearMoveRejection();

      expect(useGameStore.getState().moveRejection).toBeNull();
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

    it("leaves the rejection standing when an opponent's move lands behind it", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "That card no longer fits on that bank pile",
      });
      // An opponent moves a frame later. The toast has its own 3s timer; if
      // this wiped the reason the player would never get to read it.
      callbacks.onCardMoved!(gameState("game-1"));

      expect(useGameStore.getState().moveRejection).toBe(
        "That card no longer fits on that bank pile"
      );
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

  // ---------------------------------------------------------------------
  // The rest of the server's event surface. The client computes no game state
  // of its own - every one of these is "swap in what the server decided" - so
  // what is worth pinning is which of them are allowed to lose the board, and
  // which of them clear the error that would otherwise hide it.
  // ---------------------------------------------------------------------
  describe("connection lifecycle", () => {
    it("marks itself connected and clears a stale connection error", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ error: "Failed to connect to game server" });

      callbacks.onConnect!();

      expect(useGameStore.getState().connected).toBe(true);
      // A reconnect that left the old failure on screen would tell the player
      // they are offline while they are demonstrably not.
      expect(useGameStore.getState().error).toBeNull();
    });

    it("marks itself disconnected without throwing the board away", async () => {
      const callbacks = await registeredCallbacks();
      const live = gameState("game-1");
      useGameStore.setState({ connected: true, gameState: live });

      callbacks.onDisconnect!("transport close");

      expect(useGameStore.getState().connected).toBe(false);
      // socket.io reconnects on its own. Dropping gameState here would blank
      // the board on every blip and re-render it from nothing on recovery.
      expect(useGameStore.getState().gameState).toBe(live);
    });

    it("initializes the socket once, however many times it is asked", async () => {
      await useGameStore.getState().initializeSocket("user-1", "token");
      await useGameStore.getState().initializeSocket("user-1", "token");
      await useGameStore.getState().initializeSocket("user-1", "token");

      // The auth subscription can fire more than once; a second connect would
      // tear down the live socket and orphan the room the player is in.
      expect(socketService.connect).toHaveBeenCalledTimes(1);
      expect(useGameStore.getState().socketInitialized).toBe(true);
    });

    it("reports a failed connect and stays retryable", async () => {
      vi.mocked(socketService.connect).mockRejectedValue(new Error("refused"));

      await useGameStore.getState().initializeSocket("user-1", "token");

      expect(useGameStore.getState().error).toBe(
        "Failed to connect to game server"
      );
      // The flag has to come back down or the guard above would make the
      // failure permanent - no retry for the rest of the session.
      expect(useGameStore.getState().socketInitialized).toBe(false);
    });

    it("tears the socket down on disconnectSocket so a later login can rebuild it", () => {
      useGameStore.setState({ connected: true, socketInitialized: true });

      useGameStore.getState().disconnectSocket();

      expect(socketService.disconnect).toHaveBeenCalled();
      expect(useGameStore.getState().connected).toBe(false);
      expect(useGameStore.getState().socketInitialized).toBe(false);
    });
  });

  describe("onError", () => {
    it("surfaces the message on the fatal-eligible channel", async () => {
      const callbacks = await registeredCallbacks();

      callbacks.onError!("Something went wrong");

      expect(useGameStore.getState().error).toBe("Something went wrong");
    });

    it("lets go of a game the server says is gone", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ currentGameId: "game-1", userJoined: true });

      callbacks.onError!("Game not found");

      // Holding currentGameId for a game that does not exist means every
      // reconnect re-joins a room that will refuse again, forever.
      expect(useGameStore.getState().currentGameId).toBeNull();
      expect(useGameStore.getState().userJoined).toBe(false);
    });

    it("lets go on 'does not exist' too, not only on 'not found'", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ currentGameId: "game-1", userJoined: true });

      callbacks.onError!("That game does not exist");

      expect(useGameStore.getState().currentGameId).toBeNull();
    });

    it("keeps the player in the game for an error that is not about the game existing", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ currentGameId: "game-1", userJoined: true });

      callbacks.onError!("It is not your turn");

      expect(useGameStore.getState().currentGameId).toBe("game-1");
      expect(useGameStore.getState().userJoined).toBe(true);
    });
  });

  describe("room membership", () => {
    it("records the joined game and clears whatever the last attempt left behind", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({
        error: "Game not found",
        moveRejection: "an old rejection",
        userLeft: true,
      });

      const joined = gameState("game-1");
      callbacks.onGameJoined!(joined);

      const state = useGameStore.getState();
      expect(state.gameState).toBe(joined);
      expect(state.currentGameId).toBe("game-1");
      expect(state.userJoined).toBe(true);
      expect(state.userLeft).toBe(false);
      // Joining is a fresh start: a leftover error would put <Game> straight
      // onto its fatal screen for a game that just let the player in.
      expect(state.error).toBeNull();
      expect(state.moveRejection).toBeNull();
    });

    it("drops the board when the room is left", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({
        gameState: gameState("game-1"),
        currentGameId: "game-1",
        userJoined: true,
      });

      callbacks.onGameLeft!("game-1");

      const state = useGameStore.getState();
      expect(state.gameState).toBeNull();
      expect(state.currentGameId).toBeNull();
      expect(state.userJoined).toBe(false);
      expect(state.userLeft).toBe(true);
    });

    it("takes a player-joined event only when it carries state", async () => {
      const callbacks = await registeredCallbacks();
      const existing = gameState("game-1");
      useGameStore.setState({ gameState: existing });

      // The gateway emits this bare on some paths. Setting gameState from it
      // unconditionally would null out the board on an opponent's arrival.
      callbacks.onPlayerJoined!({ userId: "user-2" });
      expect(useGameStore.getState().gameState).toBe(existing);

      const withState = gameState("game-1");
      callbacks.onPlayerJoined!({ userId: "user-2", gameState: withState });
      expect(useGameStore.getState().gameState).toBe(withState);
    });

    it("takes a player-left event only when it carries state", async () => {
      const callbacks = await registeredCallbacks();
      const existing = gameState("game-1");
      useGameStore.setState({ gameState: existing });

      callbacks.onPlayerLeft!({ userId: "user-2" });
      expect(useGameStore.getState().gameState).toBe(existing);

      const withState = gameState("game-1");
      callbacks.onPlayerLeft!({ userId: "user-2", gameState: withState });
      expect(useGameStore.getState().gameState).toBe(withState);
    });
  });

  describe("game progress events", () => {
    it("swaps in a started game", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ error: "stale" });

      const started = gameState("game-1", { status: "playing" });
      callbacks.onGameStarted!(started);

      expect(useGameStore.getState().gameState).toBe(started);
      expect(useGameStore.getState().error).toBeNull();
    });

    it("swaps in a state update", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ error: "stale" });

      const updated = gameState("game-1");
      callbacks.onGameStateUpdated!(updated);

      expect(useGameStore.getState().gameState).toBe(updated);
      expect(useGameStore.getState().error).toBeNull();
    });

    it("swaps in a flipped draw pile", async () => {
      const callbacks = await registeredCallbacks();
      const flipped = gameState("game-1");

      callbacks.onCardFlipped!(flipped);

      expect(useGameStore.getState().gameState).toBe(flipped);
    });

    // The win condition. This callback existed before the subscription did, so
    // a game won by Blitz sat on "Game in progress!" until the player reloaded.
    it("swaps in the finished game, winner and all", async () => {
      const callbacks = await registeredCallbacks();
      useGameStore.setState({ gameState: gameState("game-1") });

      const finished = gameState("game-1", {
        status: "finished",
        winner: "player-1",
      } as Partial<GameState>);
      callbacks.onGameEnded!({
        gameState: finished,
        reason: "blitz",
        winnerId: "player-1",
        scores: { "player-1": 30 },
        calledBy: "player-1",
      });

      // The client does not decide who won - it renders gameState.winner. What
      // matters is that the terminal state lands at all.
      expect(useGameStore.getState().gameState).toBe(finished);
      expect(useGameStore.getState().gameState!.status).toBe("finished");
      expect(useGameStore.getState().error).toBeNull();
    });

    it("swaps in the forfeit shape of game-ended, which carries no winnerId", async () => {
      const callbacks = await registeredCallbacks();

      // handleForfeitGame emits `{ gameState, reason, winner }` - and `winner`
      // is undefined when nobody was left to win. Reading winnerId here would
      // throw on this path.
      const finished = gameState("game-1", { status: "finished" });
      callbacks.onGameEnded!({ gameState: finished, reason: "forfeit" });

      expect(useGameStore.getState().gameState).toBe(finished);
    });

    it("swaps in a round that ended without the game ending", async () => {
      const callbacks = await registeredCallbacks();

      const roundOver = gameState("game-1", { status: "round_over" });
      callbacks.onRoundOver!({
        gameState: roundOver,
        round: 2,
        calledBy: "player-1",
      });

      expect(useGameStore.getState().gameState).toBe(roundOver);
      expect(useGameStore.getState().gameState!.status).toBe("round_over");
    });

    it("clears the last round's move rejection when the next round is dealt", async () => {
      const callbacks = await registeredCallbacks();
      callbacks.onMoveRejected!({
        gameState: gameState("game-1"),
        reason: "That card no longer fits on that bank pile",
      });

      callbacks.onRoundStarted!({ gameState: gameState("game-1"), round: 3 });

      // Fresh decks, fresh board. A toast explaining a move from the previous
      // round would be about cards that no longer exist.
      expect(useGameStore.getState().moveRejection).toBeNull();
      expect(useGameStore.getState().error).toBeNull();
    });
  });

  describe("joinGame", () => {
    it("asks the socket to join and parks the id while the room answers", () => {
      useGameStore.getState().joinGame("game-1", "user-1");

      expect(socketService.joinGame).toHaveBeenCalledWith("game-1");
      expect(useGameStore.getState().currentGameId).toBe("game-1");
      // Not joined until the server says so - the room join is the answer,
      // not the request.
      expect(useGameStore.getState().userJoined).toBe(false);
    });

    it("refuses to join with no socket, and says why", () => {
      (socketService as { connected: boolean }).connected = false;

      useGameStore.getState().joinGame("game-1", "user-1");

      expect(socketService.joinGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().error).toBe("Not connected to game server");
    });

    it("refuses to join with no user", () => {
      useGameStore.getState().joinGame("game-1", "");

      expect(socketService.joinGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().error).toBe("Not connected to game server");
    });

    it("reports a throw from the socket rather than swallowing it", () => {
      vi.mocked(socketService.joinGame).mockImplementation(() => {
        throw new Error("Socket not connected");
      });

      useGameStore.getState().joinGame("game-1", "user-1");

      expect(useGameStore.getState().error).toBe("Socket not connected");
    });
  });

  describe("createAndJoinGame", () => {
    it("joins the game it just created", async () => {
      vi.mocked(gameService.createGame).mockResolvedValue({
        id: "game-new",
      } as Game);

      const created = await useGameStore
        .getState()
        .createAndJoinGame("Phill's Game", 3, true, "user-1");

      expect(gameService.createGame).toHaveBeenCalledWith({
        name: "Phill's Game",
        maxPlayers: 3,
        isPrivate: true,
      });
      // Creating without joining leaves the player staring at the lobby while
      // their own game waits for them.
      expect(socketService.joinGame).toHaveBeenCalledWith("game-new");
      expect(created).toEqual({ id: "game-new" });
    });

    it("reports the failure and joins nothing when the create is refused", async () => {
      vi.mocked(gameService.createGame).mockRejectedValue(
        new Error("Failed to create game. Please try again later.")
      );

      const created = await useGameStore
        .getState()
        .createAndJoinGame("Phill's Game", 2, false, "user-1");

      expect(created).toBeNull();
      expect(useGameStore.getState().error).toBe(
        "Failed to create game. Please try again later."
      );
      expect(socketService.joinGame).not.toHaveBeenCalled();
    });

    it("refuses to create a game it could never join", async () => {
      (socketService as { connected: boolean }).connected = false;

      const created = await useGameStore
        .getState()
        .createAndJoinGame("Phill's Game", 2, false, "user-1");

      expect(created).toBeNull();
      // A game created over REST with no socket to join it with is a row in
      // the database nobody is in.
      expect(gameService.createGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().error).toBe("Not connected to game server");
    });

    it("does not join a created game that came back without an id", async () => {
      vi.mocked(gameService.createGame).mockResolvedValue({} as Game);

      const created = await useGameStore
        .getState()
        .createAndJoinGame("Phill's Game", 2, false, "user-1");

      expect(created).toBeNull();
      expect(socketService.joinGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().error).toBe(
        "No game ID returned from server"
      );
    });
  });

  describe("leaveGame", () => {
    it("leaves a waiting game and refreshes the lobby behind it", () => {
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      useGameStore.setState({
        currentGameId: "game-1",
        gameState: gameState("game-1", { status: "waiting" }),
      });

      useGameStore.getState().leaveGame("user-1");

      expect(socketService.leaveGame).toHaveBeenCalledWith("game-1");
      expect(useGameStore.getState().currentGameId).toBeNull();
      expect(useGameStore.getState().gameState).toBeNull();
      expect(useGameStore.getState().userLeft).toBe(true);
      // The lobby list still has this game in it with the old player count.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: gameKeys.all });
      invalidate.mockRestore();
    });

    it("will not let a player walk out of a live game by accident", () => {
      useGameStore.setState({
        currentGameId: "game-1",
        gameState: gameState("game-1", { status: "playing" }),
      });

      useGameStore.getState().leaveGame("user-1");

      // Leaving a game in progress is a forfeit, and has to be asked for as
      // one. Navigating away must not silently concede.
      expect(socketService.leaveGame).not.toHaveBeenCalled();
      expect(socketService.forfeitGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().gameState).not.toBeNull();
    });

    it("forfeits a live game when the player means it", () => {
      useGameStore.setState({
        currentGameId: "game-1",
        gameState: gameState("game-1", { status: "playing" }),
      });

      useGameStore.getState().leaveGame("user-1", true);

      expect(socketService.forfeitGame).toHaveBeenCalledWith("game-1");
      expect(socketService.leaveGame).not.toHaveBeenCalled();
      expect(useGameStore.getState().currentGameId).toBeNull();
    });

    it("does nothing when there is no game to leave", () => {
      useGameStore.setState({ currentGameId: null });

      useGameStore.getState().leaveGame("user-1");

      expect(socketService.leaveGame).not.toHaveBeenCalled();
      expect(socketService.forfeitGame).not.toHaveBeenCalled();
    });
  });

  describe("outbound moves", () => {
    it("sends a move for the game the player is actually in", () => {
      useGameStore.setState({ gameState: gameState("game-1") });

      useGameStore.getState().makeMove("card-1", "pile-a", "pile-b");

      expect(socketService.moveCard).toHaveBeenCalledWith(
        "game-1",
        "card-1",
        "pile-a",
        "pile-b"
      );
    });

    it("sends nothing when there is no game", () => {
      useGameStore.getState().makeMove("card-1", "pile-a", "pile-b");
      useGameStore.getState().flipCard("pile-a");
      useGameStore.getState().callBlitz();
      useGameStore.getState().playerReady(true);
      useGameStore.getState().startGame();
      useGameStore.getState().startNextRound();

      expect(socketService.moveCard).not.toHaveBeenCalled();
      expect(socketService.flipCard).not.toHaveBeenCalled();
      expect(socketService.callBlitz).not.toHaveBeenCalled();
      expect(socketService.playerReady).not.toHaveBeenCalled();
      expect(socketService.startGame).not.toHaveBeenCalled();
      expect(socketService.startNextRound).not.toHaveBeenCalled();
    });

    it("reports a move that could not be sent", () => {
      useGameStore.setState({ gameState: gameState("game-1") });
      vi.mocked(socketService.moveCard).mockImplementation(() => {
        throw new Error("Socket not connected");
      });

      useGameStore.getState().makeMove("card-1", "pile-a", "pile-b");

      expect(useGameStore.getState().error).toBe("Socket not connected");
    });

    it("flips a pile, calls blitz, readies up, starts and advances against the current game", () => {
      useGameStore.setState({ gameState: gameState("game-1") });

      useGameStore.getState().flipCard("pile-a");
      useGameStore.getState().callBlitz();
      useGameStore.getState().playerReady(true);
      useGameStore.getState().startGame();
      useGameStore.getState().startNextRound();

      expect(socketService.flipCard).toHaveBeenCalledWith("game-1", "pile-a");
      expect(socketService.callBlitz).toHaveBeenCalledWith("game-1");
      expect(socketService.playerReady).toHaveBeenCalledWith("game-1", true);
      expect(socketService.startGame).toHaveBeenCalledWith("game-1");
      expect(socketService.startNextRound).toHaveBeenCalledWith("game-1");
    });

    /**
     * Each outbound action has the same shape: try to emit, and put whatever
     * went wrong on `error`. What is worth pinning is that none of them
     * swallows the failure - a silently dropped emit leaves the player
     * clicking a button that does nothing and says nothing.
     */
    const outbound: [string, keyof typeof socketService, () => void, string][] =
      [
        [
          "flipCard",
          "flipCard",
          () => useGameStore.getState().flipCard("pile-a"),
          "Failed to flip card",
        ],
        [
          "callBlitz",
          "callBlitz",
          () => useGameStore.getState().callBlitz(),
          "Failed to call blitz",
        ],
        [
          "playerReady",
          "playerReady",
          () => useGameStore.getState().playerReady(true),
          "Failed to set ready status",
        ],
        [
          "startGame",
          "startGame",
          () => useGameStore.getState().startGame(),
          "Failed to start game",
        ],
        [
          "startNextRound",
          "startNextRound",
          () => useGameStore.getState().startNextRound(),
          "Failed to start the next round",
        ],
      ];

    it.each(outbound)(
      "reports the socket's own reason when %s throws an Error",
      (_name, method, act) => {
        useGameStore.setState({ gameState: gameState("game-1"), error: null });
        vi.mocked(socketService[method] as unknown as () => void).mockImplementation(
          () => {
            throw new Error("Socket not connected");
          }
        );

        act();

        // The socket's reason is the useful one, so it wins over the fallback.
        expect(useGameStore.getState().error).toBe("Socket not connected");
      }
    );

    it.each(outbound)(
      "falls back to a readable message when %s throws a non-Error",
      (_name, method, act, fallback) => {
        useGameStore.setState({ gameState: gameState("game-1"), error: null });
        vi.mocked(socketService[method] as unknown as () => void).mockImplementation(
          () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw "a bare string, which has no .message";
          }
        );

        act();

        // The reason the `instanceof Error` check is there at all: without the
        // fallback this would put `undefined` on screen.
        expect(useGameStore.getState().error).toBe(fallback);
      }
    );
  });

  describe("flipDrawPile", () => {
    const withDrawPile = () =>
      gameState("game-1", {
        players: [
          {
            id: "player-1",
            user: { id: "user-1", username: "ada" },
            deck: { drawPile: { id: "draw-1" } },
          },
          {
            id: "player-2",
            user: { id: "user-2", username: "bob" },
            deck: { drawPile: { id: "draw-2" } },
          },
        ],
      } as unknown as Partial<GameState>);

    it("flips the draw pile belonging to the player asked for", () => {
      useGameStore.setState({ gameState: withDrawPile() });

      useGameStore.getState().flipDrawPile("player-2");

      // playerId is a local lookup key, not something sent to the server: the
      // gateway derives the actor from the socket. Sending player-1's pile id
      // for player-2 would flip the wrong deck.
      expect(socketService.flipCard).toHaveBeenCalledWith("game-1", "draw-2");
    });

    it("does nothing for a player who is not in this game", () => {
      useGameStore.setState({ gameState: withDrawPile() });

      useGameStore.getState().flipDrawPile("player-99");

      expect(socketService.flipCard).not.toHaveBeenCalled();
    });

    it("does nothing when the player has no draw pile yet", () => {
      // Before the deal, players exist but decks do not.
      useGameStore.setState({
        gameState: gameState("game-1", {
          players: [
            { id: "player-1", user: { id: "user-1", username: "ada" } },
          ],
        } as unknown as Partial<GameState>),
      });

      useGameStore.getState().flipDrawPile("player-1");

      expect(socketService.flipCard).not.toHaveBeenCalled();
    });

    it("does nothing when there is no game", () => {
      useGameStore.getState().flipDrawPile("player-1");

      expect(socketService.flipCard).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentPlayer", () => {
    const twoPlayers = () =>
      gameState("game-1", {
        players: [
          { id: "player-1", user: { id: "user-1", username: "ada" } },
          { id: "player-2", user: { id: "user-2", username: "bob" } },
        ],
      } as unknown as Partial<GameState>);

    it("finds the player by USER id, not by player id", () => {
      useGameStore.setState({ gameState: twoPlayers() });

      // The two ids are different things and both are in scope here. Matching
      // on the wrong one is how a player ends up controlling someone else's
      // hand.
      expect(useGameStore.getState().getCurrentPlayer("user-2")?.id).toBe(
        "player-2"
      );
      expect(useGameStore.getState().getCurrentPlayer("player-2")).toBeNull();
    });

    it("returns null for a user who is not in the game", () => {
      useGameStore.setState({ gameState: twoPlayers() });

      expect(useGameStore.getState().getCurrentPlayer("user-99")).toBeNull();
    });

    it("returns null with no game or no user", () => {
      expect(useGameStore.getState().getCurrentPlayer("user-1")).toBeNull();

      useGameStore.setState({ gameState: twoPlayers() });
      expect(useGameStore.getState().getCurrentPlayer(undefined)).toBeNull();
    });
  });

  describe("error channel", () => {
    it("sets and clears the error", () => {
      useGameStore.getState().setError("boom");
      expect(useGameStore.getState().error).toBe("boom");

      useGameStore.getState().clearError();
      expect(useGameStore.getState().error).toBeNull();
    });
  });
});
