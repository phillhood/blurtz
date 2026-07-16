import React from "react";
import { useGameContext } from "@hooks";

/**
 * Ready up, in the lobby or between rounds.
 *
 * Reads `currentPlayer.isReady` - the SERVER's answer - and deliberately keeps
 * no local copy. A round advance resets `isReady` on the server, so a local
 * mirror goes stale and any effect that echoes it back would ready the player
 * for the next round without them touching anything.
 */
const ReadyButton: React.FC = () => {
  const { gameState, currentPlayer, playerReady } = useGameContext();
  const status = gameState?.status;
  const isReady = currentPlayer?.isReady ?? false;

  // The two phases a player readies up in: before the first deal, and between
  // rounds. Both are gated by the same predicate on the server.
  const disabled = status !== "waiting" && status !== "round_over";

  return (
    <button
      onClick={() => playerReady(!isReady)}
      disabled={disabled}
      style={{
        padding: "12px 24px",
        backgroundColor: isReady ? "#6b7280" : "#3b82f6",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "16px",
        fontWeight: "600",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {isReady ? "✗ Cancel Ready" : "✓ Ready Up"}
    </button>
  );
};

export default ReadyButton;
