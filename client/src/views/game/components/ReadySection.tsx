import React from "react";
import { GameStatus } from "@types";
import { useGameContext, useAuthContext } from "@hooks";
import { PlayersList } from ".";
import { ReadyButton, StartGameButton } from ".";

interface ReadySectionProps {
  /** What the host's button does. */
  onAct?: () => void;
  /** The status this section is live in - the buttons grey out in any other. */
  activeStatus?: GameStatus;
  actLabel?: string;
  actWaitingLabel?: string;
  /** Hide the roster when the caller is already showing a scoreboard. */
  showPlayers?: boolean;
}

/**
 * "Everybody ready, then the host acts."
 *
 * Rendered twice, for the two phases that share that shape: the lobby before
 * round 1, and the interstitial between rounds. The props are only the labels
 * and the action - the readiness gate itself is identical, and deliberately so:
 * it mirrors `assertReadyToDeal`, the ONE server-side predicate that both
 * `startGame` and `startNextRound` are gated on.
 *
 * Nothing here decides anything. The server re-checks all of it and rejects a
 * deal that does not qualify; this only decides what the player can see and
 * press.
 */
const ReadySection: React.FC<ReadySectionProps> = ({
  onAct,
  activeStatus = "waiting",
  actLabel,
  actWaitingLabel,
  showPlayers = true,
}) => {
  const { user } = useAuthContext();
  const { gameState, currentPlayer, startGame } = useGameContext();
  const { players = [], status, hostId } = gameState || {};

  const readyCount = players.filter((p) => p.isReady).length;
  const allPlayersReady = readyCount === players.length && players.length >= 2;
  const isHost = user?.id === hostId;

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      {showPlayers && <PlayersList players={players} />}

      {!!currentPlayer && (
        <div style={{ marginBottom: "20px" }}>
          <ReadyButton />
        </div>
      )}

      {allPlayersReady && (
        <StartGameButton
          onStartGame={onAct ?? startGame}
          playerCount={players.length}
          readyCount={readyCount}
          disabled={status !== activeStatus}
          isHost={isHost}
          label={actLabel}
          waitingLabel={actWaitingLabel}
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
