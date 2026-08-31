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
  /**
   * Between rounds there is no host action: the last ready-up deals the next
   * round on the server. When set, the "everybody ready" branch shows a
   * dealing message instead of a start button, and `onAct` / `actLabel` /
   * `actWaitingLabel` go unused.
   */
  autoAdvance?: boolean;
}

/**
 * "Everybody ready, then it deals."
 *
 * Rendered twice, for the two phases that share the readiness gate: the lobby
 * before round 1, and the interstitial between rounds. The gate itself is
 * identical, and deliberately so - it mirrors the server's `assertReadyToDeal`.
 * What differs is who deals once it is satisfied:
 *
 *  - Lobby (`waiting`): the HOST presses a start button - `onAct`/`actLabel`.
 *  - Interstitial (`round_over`, `autoAdvance`): nobody presses anything. The
 *    last ready-up deals the next round on the server, so the "everybody ready"
 *    branch just says the round is dealing.
 *
 * Nothing here decides anything. The server re-checks all of it; this only
 * decides what the player can see and press.
 */
const ReadySection: React.FC<ReadySectionProps> = ({
  onAct,
  activeStatus = "waiting",
  actLabel,
  actWaitingLabel,
  showPlayers = true,
  autoAdvance = false,
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

      {allPlayersReady &&
        (autoAdvance ? (
          // No host action between rounds - the server has already dealt (or
          // is about to) off the final ready-up. This is the transient screen
          // the last player sees before the fresh `playing` board arrives.
          <p
            style={{
              fontSize: "16px",
              color: "var(--color-text-secondary)",
              fontStyle: "italic",
              marginTop: "20px",
            }}
          >
            Everyone's ready - dealing the next round...
          </p>
        ) : (
          <StartGameButton
            onStartGame={onAct ?? startGame}
            playerCount={players.length}
            readyCount={readyCount}
            disabled={status !== activeStatus}
            isHost={isHost}
            label={actLabel}
            waitingLabel={actWaitingLabel}
          />
        ))}

      {!allPlayersReady && (
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
          Waiting for all players to be ready ({readyCount}/{players.length})
        </p>
      )}
    </div>
  );
};

export default ReadySection;
