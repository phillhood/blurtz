import React from "react";
import { useGameContext } from "@hooks";
import { ReadySection, RoundScoreboard } from ".";

/**
 * The interstitial between rounds.
 *
 * Reached when a Blitz was scored and nobody has reached `targetScore` yet.
 * The scoreboard shows where everyone stands; below it, the same
 * ready-up-then-host-acts flow the lobby uses, because it is the same
 * transition with a different verb.
 *
 * `showPlayers={false}` because the scoreboard above already names every
 * player - the roster would just say it again without the scores.
 */
const RoundOverSection: React.FC = () => {
  const { gameState, startNextRound } = useGameContext();
  const round = gameState?.currentRound ?? 1;

  return (
    <div style={{ textAlign: "center", marginTop: "16px" }}>
      <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "16px" }}>
        Round {round} is over. Nobody has reached{" "}
        {gameState?.targetScore ?? 0} yet - ready up for the next one.
      </p>

      <RoundScoreboard />

      <ReadySection
        onAct={startNextRound}
        activeStatus="round_over"
        actLabel={`Start Round ${round + 1}`}
        actWaitingLabel="Waiting for host to deal the next round..."
        showPlayers={false}
      />
    </div>
  );
};

export default RoundOverSection;
