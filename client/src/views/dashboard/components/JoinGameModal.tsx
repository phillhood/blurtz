import React, { useState } from "react";
import { Button } from "@styles";
import { JoinGameRequest } from "@/types";

interface JoinGameModalProps {
  isOpen: boolean;
  onJoinGame: (payload: JoinGameRequest) => void;
  onClose: () => void;
}

const JoinGameModal: React.FC<JoinGameModalProps> = ({
  isOpen,
  onJoinGame,
  onClose,
}) => {
  const [gameCode, setGameCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    setIsLoading(true);
    e.preventDefault();
    onJoinGame({ alias: gameCode } as JoinGameRequest);
  };

  const handleClose = () => {
    setGameCode("");
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          minWidth: "400px",
          maxWidth: "500px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0, color: "#1f2937", fontSize: "1.5rem" }}>
            Join Game by Code
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#6b7280",
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleJoin}>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                color: "#374151",
                fontWeight: "500",
              }}
            >
              Game Code
            </label>
            <input
              type="text"
              placeholder="e.g., happy-blue-lemur"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "16px",
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
              autoFocus
              disabled={isLoading}
            />
            <small
              style={{ color: "#6b7280", marginTop: "4px", display: "block" }}
            >
              Enter the game code shared by your friend
            </small>
          </div>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <Button
              type="button"
              variant="default"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!gameCode.trim() || isLoading}
            >
              {isLoading ? "Joining..." : "Join Game"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JoinGameModal;
