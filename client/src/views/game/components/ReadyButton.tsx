import React from "react";
import { useGameContext } from "@hooks";

/**
 * Ready up, in the lobby or between rounds.
 *
 * Reads `currentPlayer.isReady` - the SERVER's answer - rather than keeping a
 * local copy. It used to hold `isReady` in useState and fire `playerReady`
 * from an effect keyed on `[status, isReady]`, which had two problems that
 * only became visible once there was a second round:
 *
 *  - The effect fired on mount, so opening a game announced a readiness nobody
 *    had clicked.
 *  - A round advance resets `isReady` to false on the server, but the local
 *    copy still said true - and the effect's `status` dependency then fired
 *    that stale `true` straight back, readying the player for the next round
 *    without them touching anything. Every round after the first would have
 *    readied itself the instant the previous one ended.
 *
 * Mirroring server state is what the rest of this client already does: there
 * are no optimistic updates here, and the store is the source of truth either
 * way.
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
