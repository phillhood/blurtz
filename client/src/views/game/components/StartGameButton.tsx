import React from "react";

interface StartGameButtonProps {
  onStartGame: () => void;
  disabled?: boolean;
  playerCount: number;
  readyCount: number;
  isHost: boolean;
  /** What the host's button says once everyone is ready. */
  label?: string;
  /** What everyone else is told while they wait for the host to press it. */
  waitingLabel?: string;
}

/**
 * The host's "go" button, for both deals: round 1 of a `waiting` game and the
 * next round of a `round_over` one.
 *
 * The labels are props because they are the only thing that differs between
 * the two. The gate is identical - enough players, everybody ready, and you
 * are the host - and it is the same gate the server enforces in
 * `assertReadyToDeal`. This decides what lights up; the server decides what
 * happens.
 */
const StartGameButton: React.FC<StartGameButtonProps> = ({
  onStartGame,
  disabled = false,
  playerCount,
  readyCount,
  isHost,
  label = "Start Game!",
  waitingLabel = "Waiting for host to start game...",
}) => {
  const canStart = playerCount >= 2 && readyCount === playerCount && isHost;

  // Show waiting message for non-hosts when all players are ready
  if (!isHost && playerCount >= 2 && readyCount === playerCount) {
    return (
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <p style={{ fontSize: "16px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
          {waitingLabel}
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
          ? label
          : `Waiting for players (${readyCount}/${playerCount} ready)`}
      </button>

      {playerCount < 2 && (
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "10px" }}>
          Need at least 2 players to start
        </p>
      )}
    </div>
  );
};

export default StartGameButton;
