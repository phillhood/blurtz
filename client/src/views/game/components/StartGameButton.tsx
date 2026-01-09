import React from "react";

interface StartGameButtonProps {
  onStartGame: () => void;
  disabled?: boolean;
  playerCount: number;
  readyCount: number;
  isHost: boolean;
}

const StartGameButton: React.FC<StartGameButtonProps> = ({
  onStartGame,
  disabled = false,
  playerCount,
  readyCount,
  isHost,
}) => {
  const canStart = playerCount >= 2 && readyCount === playerCount && isHost;

  // Show waiting message for non-hosts when all players are ready
  if (!isHost && playerCount >= 2 && readyCount === playerCount) {
    return (
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <p style={{ fontSize: "16px", color: "#6b7280", fontStyle: "italic" }}>
          Waiting for host to start game...
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <button
        onClick={onStartGame}
        disabled={disabled || !canStart}
        style={{
          padding: "16px 32px",
          backgroundColor: canStart ? "#3b82f6" : "#9ca3af",
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontSize: "18px",
          fontWeight: "700",
          cursor: canStart && !disabled ? "pointer" : "not-allowed",
          opacity: canStart && !disabled ? 1 : 0.6,
          transition: "all 0.2s ease",
          boxShadow: canStart ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none",
        }}
      >
        {canStart
          ? "Start Game!"
          : `Waiting for players (${readyCount}/${playerCount} ready)`}
      </button>

      {playerCount < 2 && (
        <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "10px" }}>
          Need at least 2 players to start
        </p>
      )}
    </div>
  );
};

export default StartGameButton;
