import React from "react";
import { useGameContext } from "@hooks";
import { ReadySection, RoundScoreboard } from ".";

/**
 * The interstitial between rounds.
 *
 * Reached when a Blitz was scored and nobody has reached `targetScore` yet.
 * The scoreboard shows where everyone stands; below it, the ready-up controls.
 * There is no host action here any more - the moment the last player readies
 * up the server deals the next round and broadcasts the fresh `playing` board,
 * which this component is replaced by. `autoAdvance` is what tells
 * `ReadySection` not to draw a start button.
 *
 * `showPlayers={false}` because the scoreboard above already names every
 * player - the roster would just say it again without the scores.
 */
const RoundOverSection: React.FC = () => {
  const { gameState } = useGameContext();
  const round = gameState?.currentRound ?? 1;

  return (
    <div style={{ textAlign: "center", marginTop: "16px" }}>
      <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "16px" }}>
        Round {round} is over. Nobody has reached{" "}
        {gameState?.targetScore ?? 0} yet - ready up for the next one.
      </p>

      <RoundScoreboard />

      <ReadySection showPlayers={false} autoAdvance />
    </div>
  );
};

export default RoundOverSection;
