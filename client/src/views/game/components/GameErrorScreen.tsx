import React from "react";
import { GameContainer } from "@styles";

interface ErrorScreenProps {
  error: string;
  onBackClick: () => void;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onBackClick }) => (
  <GameContainer>
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <h2>Game Error</h2>
      <p style={{ color: "#ef4444" }}>{error}</p>
      <button
        onClick={onBackClick}
        style={{
          padding: "10px 20px",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Back to Dashboard
      </button>
    </div>
  </GameContainer>
);

export default ErrorScreen;
