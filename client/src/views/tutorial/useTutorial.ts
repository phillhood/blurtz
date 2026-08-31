import { useCallback, useMemo, useReducer } from "react";
import { executeMove, flipDrawPile, validateMove } from "@blurtz/shared";
import type { Pile, PlayerDeck } from "@blurtz/shared";
import {
  RequiredMove,
  TUTORIAL_STEPS,
  TutorialStep,
  dealTutorial,
} from "./script";

export interface TutorialState {
  deck: PlayerDeck;
  bankPiles: Pile[];
  stepIndex: number;
  step: TutorialStep;
  nudge: string | null;
  finished: boolean;
}

export interface TutorialApi extends TutorialState {
  attemptMove(cardId: string, fromPileId: string, toPileId: string): void;
  flipDraw(): void;
  callBlurtz(): void;
  acknowledge(): void;
  showMe(): void;
  restart(): void;
}

const LAST_STEP = TUTORIAL_STEPS.length - 1;

const requiredMove = (
  step: TutorialStep,
  deck: PlayerDeck,
  bankPiles: Pile[]
): RequiredMove | null => step.requires?.(deck, bankPiles) ?? null;

const notYet = (step: TutorialStep) =>
  step.instruction
    ? `Not yet — ${step.instruction}.`
    : "Not yet — read the coach, then carry on.";

interface State {
  deck: PlayerDeck;
  bankPiles: Pile[];
  stepIndex: number;
  nudge: string | null;
  finished: boolean;
}

type Action =
  | { type: "advance" }
  | { type: "nudge"; nudge: string }
  | { type: "board"; deck: PlayerDeck; bankPiles: Pile[]; advance: boolean }
  | { type: "finish" }
  | { type: "restart" };

const initialState = (): State => ({
  ...dealTutorial(),
  stepIndex: 0,
  nudge: null,
  finished: false,
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "advance":
      return {
        ...state,
        stepIndex: Math.min(state.stepIndex + 1, LAST_STEP),
        nudge: null,
      };
    case "nudge":
      return { ...state, nudge: action.nudge };
    case "board":
      return {
        ...state,
        deck: action.deck,
        bankPiles: action.bankPiles,
        stepIndex: action.advance
          ? Math.min(state.stepIndex + 1, LAST_STEP)
          : state.stepIndex,
        nudge: action.advance ? null : state.nudge,
      };
    case "finish":
      return { ...state, finished: true, nudge: null };
    case "restart":
      return initialState();
  }
}

/**
 * The tutorial's whole state: one player's deck, the bank piles, and where the
 * script has got to.
 *
 * Every rule question goes to `@blurtz/shared` - a move is applied only when it
 * matches the step's required move, and any other nudge text is the engine's own
 * rejection. Refused attempts leave the board untouched, which is what stops the
 * script stranding a learner mid-lesson.
 */
export function useTutorial(): TutorialApi {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const step = TUTORIAL_STEPS[state.stepIndex];

  const apply = useCallback(
    (move: RequiredMove, advance: boolean) => {
      const deck = structuredClone(state.deck);
      const bankPiles = structuredClone(state.bankPiles);
      const board = { bankPiles };

      executeMove(deck, board, move.cardId, move.fromPileId, move.toPileId);
      dispatch({ type: "board", deck, bankPiles, advance });
    },
    [state.deck, state.bankPiles]
  );

  const flip = useCallback(
    (advance: boolean) => {
      const deck = structuredClone(state.deck);
      deck.drawPile.cards = flipDrawPile(deck.drawPile.cards);
      dispatch({
        type: "board",
        deck,
        bankPiles: state.bankPiles,
        advance,
      });
    },
    [state.deck, state.bankPiles]
  );

  const attemptMove = useCallback(
    (cardId: string, fromPileId: string, toPileId: string) => {
      if (state.finished) {
        return;
      }

      const move = requiredMove(step, state.deck, state.bankPiles);
      if (
        move &&
        move.cardId === cardId &&
        move.fromPileId === fromPileId &&
        move.toPileId === toPileId
      ) {
        apply(move, true);
        return;
      }

      const rejection = validateMove(
        state.deck,
        { bankPiles: state.bankPiles },
        cardId,
        fromPileId,
        toPileId
      );
      dispatch({ type: "nudge", nudge: rejection ?? notYet(step) });
    },
    [apply, state.bankPiles, state.deck, state.finished, step]
  );

  const flipDraw = useCallback(() => {
    if (state.finished) {
      return;
    }

    const isDrawStep = step.id === "draw";
    flip(isDrawStep);
    if (!isDrawStep) {
      dispatch({ type: "nudge", nudge: notYet(step) });
    }
  }, [flip, state.finished, step]);

  const callBlurtz = useCallback(() => {
    if (state.deck.blurtzPile.cards.length > 0) {
      dispatch({
        type: "nudge",
        nudge: "Not yet — your Blurtz pile still has cards on it.",
      });
      return;
    }

    dispatch({ type: "finish" });
  }, [state.deck]);

  const acknowledge = useCallback(() => {
    if (step.kind === "say") {
      dispatch({ type: "advance" });
    }
  }, [step]);

  const showMe = useCallback(() => {
    if (state.finished) {
      return;
    }

    const move = requiredMove(step, state.deck, state.bankPiles);
    if (move) {
      apply(move, true);
      return;
    }

    if (step.kind === "say") {
      dispatch({ type: "advance" });
      return;
    }

    flip(true);
  }, [apply, flip, state.bankPiles, state.deck, state.finished, step]);

  const restart = useCallback(() => dispatch({ type: "restart" }), []);

  return useMemo(
    () => ({
      deck: state.deck,
      bankPiles: state.bankPiles,
      stepIndex: state.stepIndex,
      step,
      nudge: state.nudge,
      finished: state.finished,
      attemptMove,
      flipDraw,
      callBlurtz,
      acknowledge,
      showMe,
      restart,
    }),
    [
      acknowledge,
      attemptMove,
      callBlurtz,
      flipDraw,
      restart,
      showMe,
      state.bankPiles,
      state.deck,
      state.finished,
      state.nudge,
      state.stepIndex,
      step,
    ]
  );
}
