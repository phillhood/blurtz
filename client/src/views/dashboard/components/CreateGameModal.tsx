import React, { useState } from "react";
import { Button, Input } from "@styles";
import { Modal } from "@components/ui";

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (
    gameName: string,
    maxPlayers: number,
    isPrivate: boolean
  ) => void;
}

const CreateGameModal: React.FC<CreateGameModalProps> = ({
  isOpen,
  onClose,
  onCreateGame,
}) => {
  const [gameName, setGameName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);
  const [errors, setErrors] = useState<{
    gameName?: string;
    maxPlayers?: string;
  }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { gameName?: string; maxPlayers?: string } = {};

    if (!gameName.trim()) {
      newErrors.gameName = "Game name is required";
    } else if (gameName.trim().length < 2) {
      newErrors.gameName = "Game name must be at least 2 characters";
    } else if (gameName.trim().length > 50) {
      newErrors.gameName = "Game name must be less than 50 characters";
    }

    if (maxPlayers < 2) {
      newErrors.maxPlayers = "Minimum 2 players required";
    } else if (maxPlayers > 4) {
      newErrors.maxPlayers = "Maximum 4 players allowed";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onCreateGame(gameName.trim(), maxPlayers, isPrivate);
      handleClose();
    }
  };

  const handleClose = () => {
    setGameName("");
    setMaxPlayers(2);
    setIsPrivate(false);
    setErrors({});
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Game">
      <form onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="gameName"
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#374151",
            }}
          >
            Game Name
          </label>
          <Input
            id="gameName"
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter game name..."
            style={{
              width: "100%",
              borderColor: errors.gameName ? "#ef4444" : undefined,
            }}
          />
          {errors.gameName && (
            <p
              style={{
                color: "#ef4444",
                fontSize: "14px",
                marginTop: "4px",
                margin: "4px 0 0 0",
              }}
            >
              {errors.gameName}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="maxPlayers"
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#374151",
            }}
          >
            Game Size
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: `2px solid ${errors.maxPlayers ? "#ef4444" : "#e5e7eb"}`,
              borderRadius: "8px",
              backgroundColor: "white",
              overflow: "hidden",
              marginBottom: "10px",
            }}
          >
            {/* TODO - move to styles */}
            <button
              type="button"
              onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
              disabled={maxPlayers <= 2}
              style={{
                backgroundColor: maxPlayers === 2 ? "#f9fafb" : "#ffffff",
                border: "none",
                borderRight: "1px solid #e5e7eb",
                fontSize: "20px",
                fontWeight: "bold",
                cursor: maxPlayers <= 2 ? "not-allowed" : "pointer",
                color: maxPlayers <= 2 ? "#9ca3af" : "#374151",
                padding: "12px 16px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#b0ceff";
              }}
              onMouseLeave={(e) => {
                if (maxPlayers > 2) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              −
            </button>

            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "16px",
                fontWeight: "600",
                color: "#374151",
                padding: "12px 16px",
                backgroundColor: "#ffffff",
              }}
            >
              {maxPlayers} players
            </div>

            <button
              type="button"
              onClick={() => setMaxPlayers(Math.min(4, maxPlayers + 1))}
              disabled={maxPlayers >= 4}
              style={{
                backgroundColor: maxPlayers === 4 ? "#f9fafb" : "#ffffff",
                border: "none",
                borderLeft: "1px solid #e5e7eb",
                fontSize: "20px",
                fontWeight: "bold",
                cursor: maxPlayers >= 4 ? "not-allowed" : "pointer",
                color: maxPlayers >= 4 ? "#9ca3af" : "#374151",
                padding: "12px 16px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#b0ceff";
              }}
              onMouseLeave={(e) => {
                if (maxPlayers < 4) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              +
            </button>
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="gameName"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Private Game
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                gap: "12px",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#f9fafb",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f1f5f9";
                e.currentTarget.style.borderColor = "#cbd5e1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#f9fafb";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                  accentColor: "#3b82f6",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  Only players with the game code can join
                </div>
              </div>
            </label>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <Button type="button" variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="secondary"
            disabled={!gameName.trim()}
          >
            Create Game
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGameModal;
