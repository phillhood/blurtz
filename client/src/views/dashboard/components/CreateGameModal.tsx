import React, { useState } from "react";
import { Button, Input } from "@styles";
import { Modal } from "@components/ui";
import { GAME_CONSTANTS } from "@blurtz/shared";

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (
    gameName: string,
    maxPlayers: number,
    isPrivate: boolean,
    targetScore: number
  ) => void;
}

const TARGET_SCORE_PRESETS = [
  { label: "Quick", value: 25 },
  { label: "Standard", value: GAME_CONSTANTS.DEFAULT_TARGET_SCORE },
  { label: "Long", value: 150 },
];

/** A preset's score, or `custom` to hand the number to the player. */
type TargetScoreChoice = number | "custom";

const CreateGameModal: React.FC<CreateGameModalProps> = ({
  isOpen,
  onClose,
  onCreateGame,
}) => {
  const [gameName, setGameName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);
  const [targetScoreChoice, setTargetScoreChoice] = useState<TargetScoreChoice>(
    GAME_CONSTANTS.DEFAULT_TARGET_SCORE
  );
  const [customTargetScore, setCustomTargetScore] = useState("");
  const [errors, setErrors] = useState<{
    gameName?: string;
    targetScore?: string;
  }>({});

  /**
   * A preset can only yield a value this file chose; a custom score is free text
   * and is the one setting a player can genuinely get wrong. CreateGameDto stays
   * the authority - this just names the refusal instead of it arriving as a 400.
   */
  const resolveTargetScore = ():
    | { ok: true; score: number }
    | { ok: false; error: string } => {
    if (targetScoreChoice !== "custom") {
      return { ok: true, score: targetScoreChoice };
    }

    const raw = customTargetScore.trim();
    if (raw === "") {
      return { ok: false, error: "Target score is required" };
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      return { ok: false, error: "Target score must be a whole number" };
    }
    if (
      parsed < GAME_CONSTANTS.MIN_TARGET_SCORE ||
      parsed > GAME_CONSTANTS.MAX_TARGET_SCORE
    ) {
      return {
        ok: false,
        error: `Target score must be between ${GAME_CONSTANTS.MIN_TARGET_SCORE} and ${GAME_CONSTANTS.MAX_TARGET_SCORE}`,
      };
    }
    return { ok: true, score: parsed };
  };

  /**
   * Only the rules a player can actually break. An empty name cannot reach this
   * (the submit is `disabled={!gameName.trim()}`, which blocks Enter too) and nor
   * can an out-of-range player count (± buttons clamp to 2-4); CreateGameDto
   * enforces both anyway, so branches for them here would be dead code.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { gameName?: string; targetScore?: string } = {};

    const trimmed = gameName.trim();
    if (trimmed.length < 2) {
      newErrors.gameName = "Game name must be at least 2 characters";
    } else if (trimmed.length > 50) {
      newErrors.gameName = "Game name must be less than 50 characters";
    }

    const targetScore = resolveTargetScore();
    if (targetScore.ok === false) {
      newErrors.targetScore = targetScore.error;
    }

    setErrors(newErrors);

    if (targetScore.ok && Object.keys(newErrors).length === 0) {
      onCreateGame(trimmed, maxPlayers, isPrivate, targetScore.score);
      handleClose();
    }
  };

  const handleClose = () => {
    setGameName("");
    setMaxPlayers(2);
    setIsPrivate(false);
    setTargetScoreChoice(GAME_CONSTANTS.DEFAULT_TARGET_SCORE);
    setCustomTargetScore("");
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
          {/* Heads the +/- buttons, which are not a labellable control. */}
          <div
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#374151",
            }}
          >
            Game Size
          </div>

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
          <div style={{ marginBottom: "10px" }}>
            <label
              htmlFor="targetScore"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Target Score
            </label>

            <select
              id="targetScore"
              value={String(targetScoreChoice)}
              onChange={(e) =>
                setTargetScoreChoice(
                  e.target.value === "custom" ? "custom" : Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                fontSize: "16px",
                fontWeight: "600",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              {TARGET_SCORE_PRESETS.map(({ label, value }) => (
                <option key={label} value={value}>
                  {label} — first to {value}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>

            {targetScoreChoice === "custom" && (
              <div style={{ marginTop: "10px" }}>
                <label
                  htmlFor="customTargetScore"
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                    color: "#374151",
                  }}
                >
                  Custom Target Score
                </label>
                <Input
                  id="customTargetScore"
                  type="number"
                  inputMode="numeric"
                  value={customTargetScore}
                  onChange={(e) => setCustomTargetScore(e.target.value)}
                  placeholder={`${GAME_CONSTANTS.MIN_TARGET_SCORE}-${GAME_CONSTANTS.MAX_TARGET_SCORE}`}
                  style={{
                    width: "100%",
                    marginBottom: 0,
                    borderColor: errors.targetScore ? "#ef4444" : undefined,
                  }}
                />
              </div>
            )}

            {errors.targetScore && (
              <p
                style={{
                  color: "#ef4444",
                  fontSize: "14px",
                  margin: "4px 0 0 0",
                }}
              >
                {errors.targetScore}
              </p>
            )}
          </div>

          <div style={{ marginBottom: "24px" }}>
            {/* Heads the checkbox group. The checkbox below is labelled by the
                <label> wrapping it, so this must not claim a control of its own. */}
            <div
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Private Game
            </div>
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
