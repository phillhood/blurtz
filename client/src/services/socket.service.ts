import { io, Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@utils";
import { GameState, Player } from "@types";

export interface SocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: string) => void;
  onGameJoined?: (gameState: GameState) => void;
  onGameLeft?: (gameId: string) => void;
  onGameStateUpdated?: (gameState: GameState) => void;
  onGameStarted?: (gameState: GameState) => void;
  onGameEnded?: (data: {
    gameState: GameState;
    reason: string;
    winner: Player;
  }) => void;
  onPlayerJoined?: (data: { gameState?: GameState; userId: string }) => void;
  onPlayerLeft?: (data: { gameState?: GameState; userId: string }) => void;
  onCardMoved?: (gameState: GameState) => void;
  onCardFlipped?: (gameState: GameState) => void;
  onBlitzCalled?: (data: { playerId: string }) => void;
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
      SOCKET_EVENTS.CARD_FLIPPED,
      (data: { gameState: GameState }) => {
        this.callbacks.onCardFlipped?.(data.gameState);
      }
    );

    this.socket.on(SOCKET_EVENTS.BLITZ_CALLED, (data: { playerId: string }) => {
      this.callbacks.onBlitzCalled?.(data);
    });

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

  joinGame(gameId: string, userId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, { gameId, userId });
  }

  leaveGame(gameId: string, userId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { gameId, userId });
  }

  forfeitGame(gameId: string, playerId: string): void {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }

    this.socket.emit(SOCKET_EVENTS.FORFEIT_GAME, {
      gameId,
      playerId,
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
    playerId: string,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.MOVE_CARD, {
      gameId,
      playerId,
      cardId,
      fromPileId,
      toPileId,
    });
  }

  flipCard(gameId: string, playerId: string, pileId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.FLIP_CARD, { gameId, playerId, pileId });
  }

  callBlitz(gameId: string, playerId: string) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.CALL_BLITZ, { gameId, playerId });
  }

  playerReady(gameId: string, playerId: string, isReady: boolean) {
    if (!this.socket?.connected) {
      throw new Error("Socket not connected");
    }
    this.socket.emit(SOCKET_EVENTS.PLAYER_READY, { gameId, playerId, isReady });
  }

  autoRejoinGame(gameId: string, userId: string) {
    if (!this.socket?.connected) {
      console.warn("Cannot auto-rejoin - socket not connected");
      return;
    }
    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, { gameId, userId });
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
