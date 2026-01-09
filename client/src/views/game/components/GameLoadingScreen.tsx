import React from "react";
import { GameContainer } from "@styles";

interface LoadingScreenProps {
  title: string;
  subtitle?: string;
  onBackClick: () => void;
  debugInfo?: React.ReactNode;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  title,
  subtitle,
  onBackClick,
  debugInfo,
}) => (
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
      <h2>{title}</h2>
      {subtitle && (
        <div style={{ fontSize: "14px", color: "#94a3b8" }}>{subtitle}</div>
      )}
      {debugInfo}
      <button
        onClick={onBackClick}
        style={{
          padding: "8px 16px",
          backgroundColor: "#6b7280",
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

export default LoadingScreen;
