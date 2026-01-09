import React from "react";
import { useGameContext } from "@hooks";
import { PlayerCard } from ".";

interface PlayersListProps {
  players: Array<{
    user: { username: string; id: string };
    isReady?: boolean;
  }>;
}

const PlayersList: React.FC<PlayersListProps> = ({ players }) => {
  const { currentPlayer } = useGameContext();

  // Sort players so current user appears first
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.user.id === currentPlayer?.user.id) return -1;
    if (b.user.id === currentPlayer?.user.id) return 1;
    return 0;
  });

  return (
    <div style={{ marginBottom: "20px" }}>
      <h3 style={{ color: "white", marginBottom: "20px" }}>
        Players ({players.length}/2)
      </h3>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        {sortedPlayers.map((player) => (
          <PlayerCard
            key={player.user.id}
            username={player.user.username}
            isReady={player.isReady || false}
            isCurrentPlayer={currentPlayer?.user.id === player.user.id}
          />
        ))}
      </div>
    </div>
  );
};

export default PlayersList;
