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
  const [errors, setErrors] = useState<{ gameName?: string }>({});

  /**
   * Only the rules a player can actually break.
   *
   * A "Game name is required" branch and `maxPlayers < 2` / `> 4` branches used
   * to sit here and could not fire. The submit is `disabled={!gameName.trim()}`
   * (asserted below), which blocks implicit Enter submission too, so the only
   * input that could produce the empty-name error is the one that makes the
   * button unclickable; and maxPlayers is state this component owns, moved only
   * by ± buttons that clamp to 2-4 and are themselves disabled at the bounds.
   * There is no other input.
   *
   * They are gone rather than made reachable, for three reasons. An empty name
   * is already covered: it is `length < 2`, so if the disabled state ever
   * regressed the player gets "at least 2 characters" - correct, and more
   * specific than "required". The server's CreateGameDto enforces all three of
   * these rules anyway, with the same wording, and its messages now reach the
   * modal verbatim - so the real defence in depth lives on the authoritative
   * side, where it belongs. And making them reachable would mean dropping the
   * disabled submit, which is behaviour a test pins deliberately.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { gameName?: string } = {};

    const trimmed = gameName.trim();
    if (trimmed.length < 2) {
      newErrors.gameName = "Game name must be at least 2 characters";
    } else if (trimmed.length > 50) {
      newErrors.gameName = "Game name must be less than 50 characters";
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
              border: "2px solid #e5e7eb",
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
