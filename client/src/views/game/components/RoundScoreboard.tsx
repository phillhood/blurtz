import React from "react";
import { useGameContext } from "@hooks";

/**
 * Every player's standing: what they scored this round, and their running
 * total against the target.
 *
 * All four numbers are read straight off `gameState` - none is computed here.
 * `score` is cumulative and `roundScore` is this round alone; the server
 * writes both, and re-deriving either client-side is how the two would come to
 * disagree.
 */
const RoundScoreboard: React.FC = () => {
  const { gameState, currentPlayer } = useGameContext();
  const players = gameState?.players ?? [];
  const targetScore = gameState?.targetScore ?? 0;

  // Highest cumulative first - the leaderboard order.
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "inline-block",
          textAlign: "left",
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid #334155",
          borderRadius: "10px",
          padding: "12px 8px",
          minWidth: "340px",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#94a3b8", fontSize: "12px" }}>
              <th style={{ textAlign: "left", padding: "6px 12px" }}>Player</th>
              <th style={{ textAlign: "right", padding: "6px 12px" }}>
                This round
              </th>
              <th style={{ textAlign: "right", padding: "6px 12px" }}>
                Total / {targetScore}
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((player) => {
              const isCurrent = player.id === currentPlayer?.id;
              return (
                <tr
                  key={player.id}
                  style={{
                    color: "#e2e8f0",
                    fontWeight: isCurrent ? 700 : 400,
                    borderTop: "1px solid #1e293b",
                  }}
                >
                  <td style={{ padding: "8px 12px" }}>
                    {isCurrent && <span style={{ marginRight: 6 }}>👤</span>}
                    {player.username}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      // A round score genuinely goes negative: two points off
                      // for every card left on the blurtz pile.
                      color: player.roundScore < 0 ? "#f87171" : "#4ade80",
                      fontFamily: "monospace",
                    }}
                  >
                    {player.roundScore > 0 ? `+${player.roundScore}` : player.roundScore}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontFamily: "monospace",
                    }}
                  >
                    {player.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RoundScoreboard;
