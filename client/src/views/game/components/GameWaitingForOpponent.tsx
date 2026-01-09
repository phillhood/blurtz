import React from "react";

interface WaitingForOpponentProps {
  playerCount: number;
}

const WaitingForOpponent: React.FC<WaitingForOpponentProps> = ({
  playerCount,
}) => (
  <div
    style={{
      gridColumn: "3",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      color: "#94a3b8",
      fontSize: "1.1rem",
      gap: "10px",
    }}
  >
    <div>Waiting for opponent...</div>
    <div style={{ fontSize: "0.9rem" }}>Players: {playerCount}/2</div>
  </div>
);

export default WaitingForOpponent;