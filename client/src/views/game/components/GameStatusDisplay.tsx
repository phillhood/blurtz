import React, { useState } from "react";
import { GameStatus } from "@styles";
import { useGameContext } from "@hooks";
import { getGameStatusTitle } from "@utils";
import { GameWaitingInfo, ReadySection } from ".";

const GameStatusDisplay: React.FC = () => {
  const { gameState } = useGameContext();
  const [showTooltip, setShowTooltip] = useState(false);

  const playerCount = gameState?.currentPlayers || 0;
  const players = gameState?.players || [];
  const { status, maxPlayers, winner } = gameState || {};

  const showWaitingInfo = status === "waiting" && playerCount < 2;
  const showReadySection = status === "waiting" && playerCount >= 2;
  const isGameFull = players.length >= (maxPlayers || 2);
  const showShareCode = status === "waiting" && !isGameFull;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(gameState?.alias || "");
    setShowTooltip(true);
    setTimeout(() => setShowTooltip(false), 1100);
  };

  return (
    <GameStatus>
      <h2 style={{ fontFamily: "Germania One", color: "#ffffff" }}>
        {getGameStatusTitle(
          status || "waiting",
          playerCount,
          maxPlayers || 2,
          winner
        )}
      </h2>

      {showShareCode && (
        <div style={{ marginTop: "12px", marginBottom: "8px" }}>
          <span style={{ color: "#94a3b8", fontSize: "14px" }}>Share this game code with a friend: </span>
          <span style={{ fontFamily: "monospace", fontSize: "16px", color: "#ffffff", marginLeft: "8px" }}>
            {gameState?.alias || ""}
          </span>
          <div style={{ position: "relative", display: "inline-block", marginLeft: "8px" }}>
            <button
              onClick={handleCopyCode}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "3px",
                transition: "all 0.2s ease",
                verticalAlign: "middle",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.transform = "scale(1)";
              }}
              title="Copy game code"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255, 255, 255, 0.8)">
                <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" />
              </svg>
            </button>
            {showTooltip && (
              <div
                className="tooltip-fade"
                style={{
                  position: "absolute",
                  top: "-40px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#10b981",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  whiteSpace: "nowrap",
                  zIndex: 1000,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
                </svg>
                Copied!
              </div>
            )}
          </div>
        </div>
      )}

      {showWaitingInfo && <GameWaitingInfo />}

      {showReadySection && <ReadySection />}
    </GameStatus>
  );
};

export default GameStatusDisplay;
