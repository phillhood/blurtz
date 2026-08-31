import React from "react";
import { Button } from "@styles";
import { TutorialStep } from "../script";

interface CoachBarProps {
  step: TutorialStep;
  stepIndex: number;
  total: number;
  nudge: string | null;
  onAcknowledge: () => void;
  onShowMe: () => void;
  onSkip: () => void;
}

/**
 * The tutorial's coaching bar: progress, the current step's copy, and the
 * controls that move past it. A `say` step is dismissed with "Got it"; a `do`
 * step is dismissed by playing the board, so it offers "Show me" instead.
 */
export const CoachBar: React.FC<CoachBarProps> = ({
  step,
  stepIndex,
  total,
  nudge,
  onAcknowledge,
  onShowMe,
  onSkip,
}) => {
  const current = stepIndex + 1;
  const filled = (current / total) * 100;

  return (
    <div className="blurtz-coach">
      <div className="blurtz-coach__top">
        <span className="blurtz-coach__step">
          Step {current} of {total}
        </span>
        <span
          className="blurtz-coach__track"
          role="progressbar"
          aria-label="Tutorial progress"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
        >
          <i style={{ width: `${filled}%` }} />
        </span>
        <Button variant="default" onClick={onSkip}>
          Skip the tutorial
        </Button>
      </div>

      <div className="blurtz-coach__body">
        <div className="blurtz-coach__text">
          <h3 className="blurtz-coach__title">{step.title}</h3>
          <p className="blurtz-coach__say">{step.say}</p>
          {step.kind === "do" && step.instruction && (
            <span className="blurtz-coach__do">{step.instruction}</span>
          )}
        </div>

        <div className="blurtz-coach__acts">
          {step.kind === "say" ? (
            <Button variant="primary" onClick={onAcknowledge}>
              Got it
            </Button>
          ) : (
            <Button variant="tertiary" onClick={onShowMe}>
              Show me
            </Button>
          )}
        </div>
      </div>

      {nudge && (
        <p className="blurtz-coach__nudge" role="status">
          {nudge}
        </p>
      )}
    </div>
  );
};
