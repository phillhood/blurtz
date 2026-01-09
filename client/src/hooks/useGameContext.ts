import { useCallback } from "react";
import { Game } from "@types";
import { useAuthStore, useGameStore } from "@stores";

// Hook for backwards compatibility - delegates to Zustand store
export const useGameContext = () => {
  const user = useAuthStore((state) => state.user);
  const gameState = useGameStore((state) => state.gameState);
  const connected = useGameStore((state) => state.connected);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  const getCurrentPlayer = useGameStore((state) => state.getCurrentPlayer);

  // Get store actions
  const storeJoinGame = useGameStore((state) => state.joinGame);
  const storeCreateAndJoinGame = useGameStore((state) => state.createAndJoinGame);
  const storeLeaveGame = useGameStore((state) => state.leaveGame);
  const storeMakeMove = useGameStore((state) => state.makeMove);
  const storeFlipCard = useGameStore((state) => state.flipCard);
  const storeFlipDrawPile = useGameStore((state) => state.flipDrawPile);
  const storeCallBlitz = useGameStore((state) => state.callBlitz);
  const storePlayerReady = useGameStore((state) => state.playerReady);
  const storeStartGame = useGameStore((state) => state.startGame);

  const currentPlayer = getCurrentPlayer(user?.id);

  // Wrapper functions that inject userId/playerId automatically
  const joinGame = useCallback(
    (gameId: string) => {
      if (user?.id) {
        storeJoinGame(gameId, user.id);
      }
    },
    [user?.id, storeJoinGame]
  );

  const createAndJoinGame = useCallback(
    async (
      name: string,
      maxPlayers: number,
      isPrivate: boolean
    ): Promise<Game | null> => {
      if (user?.id) {
        return storeCreateAndJoinGame(name, maxPlayers, isPrivate, user.id);
      }
      return null;
    },
    [user?.id, storeCreateAndJoinGame]
  );

  const leaveGame = useCallback(
    (forfeit = false) => {
      if (user?.id) {
        storeLeaveGame(user.id, forfeit);
      }
    },
    [user?.id, storeLeaveGame]
  );

  const makeMove = useCallback(
    (cardId: string, fromPileId: string, toPileId: string) => {
      if (currentPlayer?.id) {
        storeMakeMove(currentPlayer.id, cardId, fromPileId, toPileId);
      }
    },
    [currentPlayer?.id, storeMakeMove]
  );

  const flipCard = useCallback(
    (pileId: string) => {
      if (currentPlayer?.id) {
        storeFlipCard(currentPlayer.id, pileId);
      }
    },
    [currentPlayer?.id, storeFlipCard]
  );

  const flipDrawPile = useCallback(() => {
    if (currentPlayer?.id) {
      storeFlipDrawPile(currentPlayer.id);
    }
  }, [currentPlayer?.id, storeFlipDrawPile]);

  const callBlitz = useCallback(() => {
    if (currentPlayer?.id) {
      storeCallBlitz(currentPlayer.id);
    }
  }, [currentPlayer?.id, storeCallBlitz]);

  const playerReady = useCallback(
    (isReady: boolean) => {
      if (currentPlayer?.id) {
        storePlayerReady(currentPlayer.id, isReady);
      }
    },
    [currentPlayer?.id, storePlayerReady]
  );

  const startGame = useCallback(() => {
    storeStartGame();
  }, [storeStartGame]);

  return {
    gameState,
    connected,
    joinGame,
    createAndJoinGame,
    leaveGame,
    makeMove,
    flipCard,
    flipDrawPile,
    callBlitz,
    playerReady,
    startGame,
    currentPlayer,
    error,
    clearError,
  };
};
