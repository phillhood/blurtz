import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { Game, GameState, Player } from "@types";
import { gameService } from "@services/game.service";
import { socketService, SocketCallbacks } from "@services/socket.service";
import { queryClient } from "../lib/queryClient";
import { gameKeys } from "@hooks/queries/useGamesQuery";

interface GameStoreState {
  // Data
  gameState: GameState | null;
  currentGameId: string | null;
  connected: boolean;
  socketInitialized: boolean;
  error: string | null;
  // Internal flags
  userJoined: boolean;
  userLeft: boolean;
}

interface GameStoreActions {
  // Connection
  initializeSocket: (userId: string, token: string) => Promise<void>;
  disconnectSocket: () => void;
  joinGame: (gameId: string, userId: string) => void;
  createAndJoinGame: (
    name: string,
    maxPlayers: number,
    isPrivate: boolean,
    userId: string
  ) => Promise<Game | null>;
  leaveGame: (userId: string, forfeit?: boolean) => void;
  // Game actions
  makeMove: (
    playerId: string,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ) => void;
  flipCard: (playerId: string, pileId: string) => void;
  flipDrawPile: (playerId: string) => void;
  callBlitz: (playerId: string) => void;
  playerReady: (playerId: string, isReady: boolean) => void;
  startGame: () => void;
  // Util
  clearError: () => void;
  setError: (error: string | null) => void;
  getCurrentPlayer: (userId: string | undefined) => Player | null;
}

type GameStore = GameStoreState & GameStoreActions;

export const useGameStore = create<GameStore>()(
  devtools(
    (set, get) => ({
      // State
      gameState: null,
      currentGameId: null,
      connected: false,
      socketInitialized: false,
      error: null,
      userJoined: false,
      userLeft: false,

      // Socket callbacks creator
      initializeSocket: async (_userId: string, token: string) => {
        const state = get();
        if (state.socketInitialized) return;

        const callbacks: SocketCallbacks = {
          onConnect: () => {
            set({ connected: true, error: null });
          },

          onDisconnect: () => {
            set({ connected: false });
          },

          onError: (errorMessage: string) => {
            set({ error: errorMessage });

            if (
              errorMessage.includes("not found") ||
              errorMessage.includes("does not exist")
            ) {
              set({
                currentGameId: null,
                userJoined: false,
                userLeft: false,
              });
              sessionStorage.removeItem("currentGameId");
            }
          },

          onGameJoined: (newGameState: GameState) => {
            const { currentGameId } = get();
            set({
              gameState: newGameState,
              currentGameId:
                currentGameId !== newGameState.id ? newGameState.id : currentGameId,
              userJoined: true,
              userLeft: false,
              error: null,
            });
            sessionStorage.setItem("currentGameId", newGameState.id);
          },

          onGameLeft: (_gameId: string) => {
            sessionStorage.removeItem("currentGameId");
            set({
              gameState: null,
              currentGameId: null,
              userJoined: false,
              userLeft: true,
            });
          },

          onGameStateUpdated: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },

          onGameStarted: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },

          onPlayerJoined: (data) => {
            if (data.gameState) {
              set({ gameState: data.gameState });
            }
          },

          onPlayerLeft: (data) => {
            if (data.gameState) {
              set({ gameState: data.gameState });
            }
          },

          onGameEnded: (data: {
            gameState: GameState;
            reason: string;
            winner?: Player;
          }) => {
            set({ gameState: data.gameState, error: null });
          },

          onCardMoved: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },

          onCardFlipped: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },
        };

        socketService.setCallbacks(callbacks);

        // Mark as initialized before connecting to prevent retry loops
        set({ socketInitialized: true });

        try {
          await socketService.connect(token);
        } catch {
          set({ error: "Failed to connect to game server", socketInitialized: false });
        }
      },

      disconnectSocket: () => {
        socketService.disconnect();
        set({ connected: false, socketInitialized: false });
      },

      // Connection actions
      createAndJoinGame: async (
        name: string,
        maxPlayers: number,
        isPrivate: boolean,
        userId: string
      ): Promise<Game | null> => {
        if (!userId || !socketService.connected) {
          set({ error: "Not connected to game server" });
          return null;
        }

        try {
          set({ error: null });
          const newGame = await gameService.createGame({
            name,
            maxPlayers,
            isPrivate,
          });

          if (!newGame.id) {
            throw new Error("No game ID returned from server");
          }

          get().joinGame(newGame.id, userId);
          return newGame;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to create game",
          });
          return null;
        }
      },

      joinGame: (gameId: string, userId: string) => {
        if (!userId || !socketService.connected) {
          set({ error: "Not connected to game server" });
          return;
        }

        try {
          set({
            currentGameId: gameId,
            userJoined: false,
            userLeft: false,
            error: null,
          });
          socketService.joinGame(gameId, userId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to join game",
          });
        }
      },

      leaveGame: (userId: string, forfeit = false) => {
        const { currentGameId, gameState } = get();

        if (!currentGameId || !userId) {
          return;
        }

        if (gameState?.status === "playing" && !forfeit) {
          return;
        }

        try {
          const gameId = currentGameId;
          sessionStorage.removeItem("currentGameId");

          set({
            userLeft: true,
            userJoined: false,
            currentGameId: null,
            gameState: null,
          });

          queryClient.invalidateQueries({ queryKey: gameKeys.all });

          if (forfeit) {
            const player = gameState?.players?.find((p) => p.user.id === userId);
            if (player) {
              socketService.forfeitGame(gameId, player.id);
            }
          } else {
            socketService.leaveGame(gameId, userId);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to leave game",
          });
        }
      },

      makeMove: (
        playerId: string,
        cardId: string,
        fromPileId: string,
        toPileId: string
      ) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.moveCard(gameState.id, playerId, cardId, fromPileId, toPileId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to make move",
          });
        }
      },

      flipCard: (playerId: string, pileId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.flipCard(gameState.id, playerId, pileId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to flip card",
          });
        }
      },

      flipDrawPile: (playerId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        const player = gameState.players?.find((p) => p.id === playerId);
        if (!player?.deck?.drawPile?.id) return;

        get().flipCard(playerId, player.deck.drawPile.id);
      },

      callBlitz: (playerId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.callBlitz(gameState.id, playerId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to call blitz",
          });
        }
      },

      playerReady: (playerId: string, isReady: boolean) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.playerReady(gameState.id, playerId, isReady);
        } catch (error) {
          set({
            error:
              error instanceof Error ? error.message : "Failed to set ready status",
          });
        }
      },

      startGame: () => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.startGame(gameState.id);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to start game",
          });
        }
      },

      // Util
      clearError: () => set({ error: null }),
      setError: (error: string | null) => set({ error }),

      getCurrentPlayer: (userId: string | undefined) => {
        const { gameState } = get();
        if (!gameState || !userId) return null;
        return gameState.players?.find((p) => p.user.id === userId) || null;
      },
    }),
    { name: "GameStore" }
  )
);

// Auto-initialize/disconnect socket based on auth state changes
// This runs outside React - no useEffect, no dependency arrays
import { useAuthStore } from "./authStore";
import { User } from "@types";

let prevUser: User | null = null;

useAuthStore.subscribe((state) => {
  const user = state.user;
  const gameStore = useGameStore.getState();

  if (user && !prevUser) {
    const token = localStorage.getItem("token");
    if (token && !gameStore.socketInitialized) {
      gameStore.initializeSocket(user.id, token);
    }
  } else if (!user && prevUser) {
    gameStore.disconnectSocket();
  }

  prevUser = user;
});
