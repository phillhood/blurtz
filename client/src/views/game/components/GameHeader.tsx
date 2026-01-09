import { useGameContext } from "@hooks";
import { Button } from "@styles";
import React, { useState } from "react";

interface GameHeaderProps {
  onLeave: () => void;
  onCopyCode: () => void;
}

const GameHeader: React.FC<GameHeaderProps> = ({ onLeave, onCopyCode }) => {
  const { gameState } = useGameContext();
  const [showTooltip, setShowTooltip] = useState(false);
  const gameName = gameState?.name;
  const gameCode = gameState?.alias;

  const handleCopyCode = () => {
    onCopyCode();
    setShowTooltip(true);
    setTimeout(() => {
      setShowTooltip(false);
    }, 1100);
  };

  const getLeaveButtonText = () => {
    switch (gameState?.status) {
      case "playing":
        return "Forfeit";
      case "waiting":
        return "Leave Game";
      default:
        return "Leave";
    }
  };

  const getLeaveButtonVariant = () => {
    return gameState?.status === "playing" ? "danger" : "warning";
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 20px",
        background: "linear-gradient(rgb(35, 59, 99), #0f172a)",
        marginBottom: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <h3 style={{ margin: 0, color: "#ffffff", fontFamily: "Germania One" }}>
          Game:{" "}
        </h3>
        <span style={{ fontFamily: "sans-serif " }}>{gameName}</span>
        <h3
          style={{
            marginLeft: 20,
            color: "#ffffff",
            fontFamily: "Germania One",
          }}
        >
          Code:{" "}
        </h3>
        <span style={{ fontFamily: "monospace" }}>{gameCode}</span>
        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            onClick={handleCopyCode}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "3px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.transform = "scale(1)";
            }}
            title="Copy game code"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="rgba(255, 255, 255, 0.8)"
              style={{ display: "block" }}
            >
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
              </svg>
              Copied to clipboard!
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <Button
          onClick={onLeave}
          variant={getLeaveButtonVariant()}
          style={{
            padding: "6px 12px",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "12px",
            opacity: 1,
          }}
        >
          {getLeaveButtonText()}
        </Button>
      </div>
    </div>
  );
};

export default GameHeader;
