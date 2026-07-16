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
  /**
   * Something went wrong with the connection, the room, or a request. <Game>
   * decides whether this is fatal by looking at its text, so ONLY put things
   * here that are allowed to be fatal.
   */
  error: string | null;
  /**
   * Why the server refused the last move. Deliberately NOT `error`.
   *
   * Rejection reasons are free text chosen by the server ("Destination pile
   * not found", "That card no longer fits on that bank pile"), and <Game>
   * decides fatality by substring-matching `error` for "not found". Sharing
   * the field means a bad pile id ejects a player out of a live game they are
   * still perfectly able to play. A refused move is never fatal, so it gets a
   * channel the fatality heuristic cannot see.
   */
  moveRejection: string | null;
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
  // Game actions.
  // The server derives the acting player from the socket's authenticated
  // connection, so these no longer take (and must not send) a playerId.
  makeMove: (cardId: string, fromPileId: string, toPileId: string) => void;
  flipCard: (pileId: string) => void;
  flipDrawPile: (playerId: string) => void;
  callBlitz: () => void;
  playerReady: (isReady: boolean) => void;
  startGame: () => void;
  // Util
  clearError: () => void;
  setError: (error: string | null) => void;
  clearMoveRejection: () => void;
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
      moveRejection: null,
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
              moveRejection: null,
            });
          },

          onGameLeft: (_gameId: string) => {
            set({
              gameState: null,
              currentGameId: null,
              userJoined: false,
              userLeft: true,
              moveRejection: null,
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

          // Swap the state in, exactly like every other event here. It arrives
          // with `status: "finished"` and `winner` set, and the final
          // scoreboard renders itself off that - the client does not decide
          // who won.
          onGameEnded: (data: { gameState: GameState }) => {
            set({ gameState: data.gameState, error: null });
          },

          onCardMoved: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },

          // A refused move still swaps gameState. That new object identity is
          // what tells the board the move resolved - without it the card the
          // player dragged stays hidden on the pile it never left.
          //
          // The reason goes to `moveRejection`, never `error`: losing a race
          // (or holding a stale pile id) is routine play, and must not be
          // eligible for <Game>'s fatal-error screen. It is also why nothing
          // else clears this field - it expires on its own 3s toast timer, so
          // an opponent's move landing a frame later cannot wipe the
          // explanation before the player has read it.
          onMoveRejected: (data: { gameState: GameState; reason: string }) => {
            set({ gameState: data.gameState, moveRejection: data.reason });
          },

          onCardFlipped: (newGameState: GameState) => {
            set({ gameState: newGameState, error: null });
          },

          // A round ended without anyone reaching the target. Nothing to do
          // but swap the state in - it arrives with `status: "round_over"`,
          // the scores accumulated and everyone's isReady cleared, and the
          // round-over screen renders itself off that. The client does not
          // compute a score or a round number; it mirrors what the server
          // decided, like every other event here.
          onRoundOver: (data: { gameState: GameState }) => {
            set({ gameState: data.gameState, error: null });
          },

          onRoundStarted: (data: { gameState: GameState }) => {
            set({ gameState: data.gameState, error: null, moveRejection: null });
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
            moveRejection: null,
          });
          socketService.joinGame(gameId);
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

          set({
            userLeft: true,
            userJoined: false,
            currentGameId: null,
            gameState: null,
            moveRejection: null,
          });

          queryClient.invalidateQueries({ queryKey: gameKeys.all });

          if (forfeit) {
            socketService.forfeitGame(gameId);
          } else {
            socketService.leaveGame(gameId);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to leave game",
          });
        }
      },

      makeMove: (cardId: string, fromPileId: string, toPileId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.moveCard(gameState.id, cardId, fromPileId, toPileId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to make move",
          });
        }
      },

      flipCard: (pileId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.flipCard(gameState.id, pileId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to flip card",
          });
        }
      },

      // playerId is still needed here to look the player's own draw pile id up
      // out of the local game state - it is not sent to the server.
      flipDrawPile: (playerId: string) => {
        const { gameState } = get();
        if (!gameState) return;

        const player = gameState.players?.find((p) => p.id === playerId);
        if (!player?.deck?.drawPile?.id) return;

        get().flipCard(player.deck.drawPile.id);
      },

      callBlitz: () => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.callBlitz(gameState.id);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to call blitz",
          });
        }
      },

      playerReady: (isReady: boolean) => {
        const { gameState } = get();
        if (!gameState) return;

        try {
          socketService.playerReady(gameState.id, isReady);
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
      clearMoveRejection: () => set({ moveRejection: null }),

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
