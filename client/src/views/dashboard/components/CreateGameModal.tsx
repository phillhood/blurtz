import React, { useState } from "react";
import { SegmentedControl, Toggle } from "@shychedelic/voidglass-react";
import { Button, Input } from "@styles";
import { Modal, SeatIndicator } from "@components/ui";
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
    <Modal isOpen={isOpen} onClose={handleClose} title="New table">
      <form onSubmit={handleSubmit}>
        <div className="blurtz-field">
          <label className="blurtz-field__label" htmlFor="gameName">
            Name
          </label>
          <Input
            id="gameName"
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter game name..."
          />
          {errors.gameName && (
            <p className="blurtz-field__error">{errors.gameName}</p>
          )}
        </div>

        <div className="blurtz-field">
          <div className="blurtz-field__label">Seats</div>
          <div className="blurtz-stepper">
            <button
              type="button"
              className="blurtz-stepper__button"
              onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
              disabled={maxPlayers <= 2}
            >
              &#8722;
            </button>
            <div className="blurtz-stepper__value">{maxPlayers} players</div>
            <button
              type="button"
              className="blurtz-stepper__button"
              onClick={() => setMaxPlayers(Math.min(4, maxPlayers + 1))}
              disabled={maxPlayers >= 4}
            >
              +
            </button>
            <SeatIndicator filled={maxPlayers} total={4} yoursSeated />
          </div>
        </div>

        <div className="blurtz-field">
          <div className="blurtz-field__label">Target score</div>
          <SegmentedControl
            options={[
              ...TARGET_SCORE_PRESETS.map(({ label, value }) => ({
                label: `${label} \u00b7 ${value}`,
                value: String(value),
              })),
              { label: "Custom", value: "custom" },
            ]}
            value={String(targetScoreChoice)}
            onChange={(value) =>
              setTargetScoreChoice(value === "custom" ? "custom" : Number(value))
            }
            aria-label="Target score"
          />

          {targetScoreChoice === "custom" && (
            <div className="blurtz-field">
              <label className="blurtz-field__label" htmlFor="customTargetScore">
                Custom target score
              </label>
              <Input
                id="customTargetScore"
                type="number"
                inputMode="numeric"
                value={customTargetScore}
                onChange={(e) => setCustomTargetScore(e.target.value)}
                placeholder={`${GAME_CONSTANTS.MIN_TARGET_SCORE}-${GAME_CONSTANTS.MAX_TARGET_SCORE}`}
              />
            </div>
          )}

          {errors.targetScore && (
            <p className="blurtz-field__error">{errors.targetScore}</p>
          )}
        </div>

        <div className="blurtz-field">
          <div className="blurtz-field__label">Private table</div>
          <Toggle
            checked={isPrivate}
            onChange={setIsPrivate}
            label="Joinable by code only"
          />
        </div>

        <div className="blurtz-dialog__actions">
          <Button type="button" variant="tertiary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!gameName.trim()}>
            Create and deal
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGameModal;
