import React from "react";
import { useGameContext } from "@hooks";
import { PlayersList, ReadyButton } from ".";

const GameWaitingInfo: React.FC = () => {
  const { gameState, currentPlayer } = useGameContext();
  const players = gameState?.players || [];

  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <PlayersList players={players} />
      {!!currentPlayer && (
        <div style={{ marginBottom: "20px" }}>
          <ReadyButton />
        </div>
      )}
    </div>
  );
};

export default GameWaitingInfo;
