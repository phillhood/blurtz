import React from "react";

interface PlayerCardProps {
  username: string;
  isReady: boolean;
  isCurrentPlayer: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  username,
  isReady,
  isCurrentPlayer,
}) => (
  <div
    style={{
      padding: "10px 15px",
      backgroundColor: isReady ? "#dcfce7" : "#fee2e2",
      border: `2px solid ${isReady ? "#16a34a" : "#f87171"}`,
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
    }}
  >
    <div style={{ color: "#1f2937", display: "flex", alignItems: "center", gap: "6px" }}>
      {isCurrentPlayer && <span style={{ fontSize: "12px" }}>👤</span>}
      {username}
    </div>
    <div
      style={{
        fontSize: "12px",
        color: isReady ? "#16a34a" : "#dc2626",
      }}
    >
      {isReady ? "✓ Ready" : "✗ Not Ready"}
    </div>
  </div>
);

export default PlayerCard;
