import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@styles";
import { useAuthContext } from "@hooks";
import { useTutorial } from "./useTutorial";
import TutorialBoard from "./TutorialBoard";
import { CoachBar } from "./components";
import { TUTORIAL_STEPS } from "./script";

const Tutorial: React.FC = () => {
  const tutorial = useTutorial();
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const leave = () => navigate(user ? "/dashboard" : "/login");

  return (
    <div className="blurtz-tutorial">
      <div className="blurtz-tutorial__head">
        <div>
          <h1 className="blurtz-pagetitle">How to play</h1>
          <p className="blurtz-pagesub">Nertz, one rule at a time</p>
        </div>
        <Button variant="tertiary" onClick={leave}>
          {user ? "Back to tables" : "Back to sign in"}
        </Button>
      </div>

      {tutorial.finished ? (
        <div className="blurtz-tutorial__done">
          <h2 className="blurtz-tutorial__donetitle">That is the whole game.</h2>
          <p className="blurtz-tutorial__doneblurb">
            You banked two cards and emptied your Blurtz pile. In a real game that
            pile holds ten, three other people are racing you for the same bank
            piles, and nobody waits for a turn.
          </p>
          <div className="blurtz-tutorial__doneacts">
            <Button variant="tertiary" onClick={tutorial.restart}>
              Play it again
            </Button>
            <Button variant="primary" onClick={leave}>
              {user ? "Find a table" : "Sign in and play"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <TutorialBoard tutorial={tutorial} />
          <CoachBar
            step={tutorial.step}
            stepIndex={tutorial.stepIndex}
            total={TUTORIAL_STEPS.length}
            nudge={tutorial.nudge}
            onAcknowledge={tutorial.acknowledge}
            onShowMe={tutorial.showMe}
            onSkip={leave}
          />
        </>
      )}
    </div>
  );
};

export default Tutorial;
