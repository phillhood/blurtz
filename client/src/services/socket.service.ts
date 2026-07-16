import { io, Socket } from "socket.io-client";
// The event names come from the shared package now, so the name this client
// listens for and the name the server emits are the same constant rather than
// two hand-synced copies.
import { SOCKET_EVENTS } from "@blurtz/shared";
import { GameState, Player } from "@types";

export interface SocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: string) => void;
  onGameJoined?: (gameState: GameState) => void;
  onGameLeft?: (gameId: string) => void;
  onGameStateUpdated?: (gameState: GameState) => void;
  onGameStarted?: (gameState: GameState) => void;
  /**
   * The game is over. Shaped after what the gateway ACTUALLY emits, which is
   * not one shape but two:
   *
   *   - `handleCallBlitz` sends `{ gameState, reason: "blitz", winnerId,
   *     scores, calledBy, timestamp }`
   *   - `handleForfeitGame` sends `{ gameState, reason: "forfeit", winner,
   *     timestamp }` - and `winner` is `undefined` when the game finished with
   *     nobody left to win it.
   *
   * So everything except `gameState` and `reason` is optional here. Nothing
   * needs to pick between them: `gameState.winner` carries the winning
   * player's id on both paths, and that is what the UI reads.
   */
  onGameEnded?: (data: {
    gameState: GameState;
    reason: string;
    winnerId?: string | null;
    winner?: Player;
    scores?: Record<string, number>;
    calledBy?: string;
  }) => void;
  onPlayerJoined?: (data: { gameState?: GameState; userId: string }) => void;
  onPlayerLeft?: (data: { gameState?: GameState; userId: string }) => void;
  onCardMoved?: (gameState: GameState) => void;
  /**
   * The server refused this client's move. Carries state, so the board can be
   * reconciled rather than left mid-move.
   */
  onMoveRejected?: (data: { gameState: GameState; reason: string }) => void;
  onCardFlipped?: (gameState: GameState) => void;
  onBlitzCalled?: (data: { playerId: string }) => void;
  /**
   * A Blitz was scored but nobody reached targetScore. The game is not over -
   * it is waiting for everyone to ready up for the next round.
   */
  onRoundOver?: (data: {
    gameState: GameState;
    round: number;
    calledBy: string;
  }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private isConnected = false;
  private connectionPromise: Promise<Socket> | null = null; // Add this

  connect(token: string): Promise<Socket> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.close();
      }

      this.socket = io(`http://${window.location.hostname}:3031`, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
        autoConnect: false, // Don't auto-connect, we'll call connect() manually
      });

      this.setupEventListeners();

      this.socket.on("connect", () => {
        this.isConnected = true;
        this.connectionPromise = null;
        this.callbacks.onConnect?.();
        resolve(this.socket!);
      });

      this.socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err);
        this.isConnected = false;
        this.connectionPromise = null;
        this.callbacks.onError?.("Failed to connect to game server");
        reject(err);
      });

      // Connect after all listeners are set up
      this.socket.connect();
    });

    return this.connectionPromise;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on("disconnect", (reason) => {
      this.isConnected = false;
      this.callbacks.onDisconnect?.(reason);
    });

    this.socket.on(
      SOCKET_EVENTS.ROOM_JOINED,
      (data: { gameState: GameState }) => {
        this.callbacks.onGameJoined?.(data.gameState);
      }
    );

    this.socket.on(SOCKET_EVENTS.ROOM_LEFT, (data: { gameId: string }) => {
      this.callbacks.onGameLeft?.(data.gameId);
    });

    this.socket.on(
      SOCKET_EVENTS.GAME_STATE_UPDATED,
      (data: { gameState: GameState }) => {
        this.callbacks.onGameStateUpdated?.(data.gameState);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.GAME_STARTED,
      (data: { gameState: GameState }) => {
        this.callbacks.onGameStarted?.(data.gameState);
      }
    );

    // The end of the game. This subscription did not exist, so
    // `gameStore.onGameEnded` was dead code and a game won by Blitz sat on
    // "Game in progress!" until the player reloaded - the win condition was
    // invisible. Forfeiting only looked fine because the gateway emits
    // GAME_STATE_UPDATED before GAME_ENDED on that path, and that first event
    // is subscribed; the Blitz path has no such fallback.
    this.socket.on(
      SOCKET_EVENTS.GAME_ENDED,
      (data: {
        gameState: GameState;
        reason: string;
        winnerId?: string | null;
        winner?: Player;
        scores?: Record<string, number>;
        calledBy?: string;
      }) => {
        this.callbacks.onGameEnded?.(data);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.PLAYER_JOINED,
      (data: { gameState?: GameState; userId: string }) => {
        this.callbacks.onPlayerJoined?.(data);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.PLAYER_LEFT,
      (data: { gameState?: GameState; userId: string }) => {
        this.callbacks.onPlayerLeft?.(data);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.CARD_MOVED,
      (data: { gameState: GameState }) => {
        this.callbacks.onCardMoved?.(data.gameState);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.MOVE_REJECTED,
      (data: { gameState: GameState; reason: string }) => {
        this.callbacks.onMoveRejected?.(data);
      }
    );

    this.socket.on(
      SOCKET_EVENTS.CARD_FLIPPED,
      (data: { gameState: GameState }) => {
        this.callbacks.onCardFlipped?.(data.gameState);
      }
    );

    this.socket.on(SOCKET_EVENTS.BLITZ_CALLED, (data: { playerId: string }) => {
      this.callbacks.onBlitzCalled?.(data);
    });

    this.socket.on(
      SOCKET_EVENTS.ROUND_OVER,
      (data: { gameState: GameState; round: number; calledBy: string }) => {
        this.callbacks.onRoundOver?.(data);
      }
    );

    this.socket.on(SOCKET_EVENTS.ERROR, (data: { message: string }) => {
      console.error("Game error:", data.message);
      this.callbacks.onError?.(data.message);
    });
  }

  setCallbacks(callbacks: SocketCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      this.connectionPromise = null;
      this.callbacks = {};
    }
  }

  joinGame(gameId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, { gameId });
  }

  leaveGame(gameId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { gameId });
  }

  forfeitGame(gameId: string): void {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }

    this.socket.emit(SOCKET_EVENTS.FORFEIT_GAME, {
      gameId,
    });
  }

  startGame(gameId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.START_GAME, { gameId });
  }

  moveCard(
    gameId: string,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.MOVE_CARD, {
      gameId,
      cardId,
      fromPileId,
      toPileId,
    });
  }

  flipCard(gameId: string, pileId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.FLIP_CARD, { gameId, pileId });
  }

  callBlitz(gameId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.CALL_BLITZ, { gameId });
  }

  playerReady(gameId: string, isReady: boolean) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.PLAYER_READY, { gameId, isReady });
  }

  autoRejoinGame(gameId: string) {
    if (!this.socket?.connected) {
      console.warn("Cannot auto-rejoin - socket not connected");
      return;
    }
    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, { gameId });
  }

  // Utility methods
  get connected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  get socketId(): string | undefined {
    return this.socket?.id;
  }
}

export const socketService = new SocketService();
