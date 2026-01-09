import { useGameContext } from "@hooks";
import React, { useEffect } from "react";

const ReadyButton: React.FC = () => {
  const [isReady, setIsReady] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const { gameState, playerReady } = useGameContext();
  const { status } = gameState || {};

  useEffect(() => {
    setDisabled(status !== "waiting");
    playerReady(isReady);
  }, [status, isReady]);

  const toggleReady = () => {
    setIsReady((prev) => !prev);
  };

  return (
    <button
      onClick={toggleReady}
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
