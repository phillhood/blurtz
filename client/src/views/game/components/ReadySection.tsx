import React from "react";
import { useGameContext, useAuthContext } from "@hooks";
import { PlayersList } from ".";
import { ReadyButton, StartGameButton } from ".";

const ReadySection: React.FC = () => {
  const { user } = useAuthContext();
  const { gameState, currentPlayer, startGame } = useGameContext();
  const { players = [], status, hostId } = gameState || {};

  const readyCount = players.filter((p) => p.isReady).length;
  const allPlayersReady = readyCount === players.length && players.length >= 2;
  const isHost = user?.id === hostId;

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <PlayersList players={players} />

      {!!currentPlayer && (
        <div style={{ marginBottom: "20px" }}>
          <ReadyButton />
        </div>
      )}

      {allPlayersReady && (
        <StartGameButton
          onStartGame={startGame}
          playerCount={players.length}
          readyCount={readyCount}
          disabled={status !== "waiting"}
          isHost={isHost}
        />
      )}

      {!allPlayersReady && (
        <p style={{ fontSize: "14px", color: "#6b7280" }}>
          Waiting for all players to be ready ({readyCount}/{players.length})
        </p>
      )}
    </div>
  );
};

export default ReadySection;
