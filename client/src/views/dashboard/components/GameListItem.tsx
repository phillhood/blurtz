import React from "react";
import { Game, JoinGameRequest } from "@types";
import { Button } from "@styles";
import { getStatusColor, formatDate } from "@utils";

interface GameListItemProps {
  game: Game;
  active?: boolean;
  onJoin: (payload: JoinGameRequest) => void;
}

const GameListItem: React.FC<GameListItemProps> = ({
  game,
  active,
  onJoin,
}) => {
  const canJoin =
    active ||
    (game.status !== "finished" && game.currentPlayers < game.maxPlayers);

  const statusText =
    game.status.toLowerCase() === "waiting"
      ? game.currentPlayers >= game.maxPlayers
        ? "Waiting to start"
        : "Waiting for more players"
      : game.status.toLowerCase() === "starting"
      ? "Starting"
      : game.status.toLowerCase() === "playing"
      ? "Playing"
      : game.status.toLowerCase() === "paused"
      ? "Paused"
      : "Finished";

  const getButtonText = () => {
    if (game.status === "finished") return "Finished";
    if (!active && game.currentPlayers >= game.maxPlayers) return "Full";
    return active ? "Rejoin" : "Join Game";
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        backgroundColor: "#f9fafb",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 10px 0", color: "#1f2937" }}>{game.name}</h2>
        <div
          style={{
            display: "flex",
            gap: "16px",
            fontSize: "14px",
            color: "#6b7280",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontWeight: "600",
            }}
          >
            Players:{" "}
            <span
              style={{
                color: getStatusColor(game.status),
                fontWeight: "600",
              }}
            >
              {game.currentPlayers}/{game.maxPlayers}
            </span>
          </span>
          <span
            style={{
              color: getStatusColor(game.status),
              fontWeight: "600",
            }}
          >
            {statusText}
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "#6b7280",
            }}
          >
            Created:{" "}
            <span style={{ fontStyle: "italic" }}>
              {formatDate(game.createdAt)}
            </span>
          </span>
        </div>
      </div>

      <Button
        variant="primary"
        onClick={() => onJoin({ id: game.id })}
        disabled={!canJoin}
      >
        {getButtonText()}
      </Button>
    </div>
  );
};

export default GameListItem;
