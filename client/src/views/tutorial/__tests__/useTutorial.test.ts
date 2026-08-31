import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { validateMove } from "@blurtz/shared";
import { dealTutorial, workPileId } from "../script";
import { useTutorial } from "../useTutorial";

const reachDrawStep = (api: () => ReturnType<typeof useTutorial>) => {
  act(() => api().acknowledge());
  for (let i = 0; i < 5; i++) {
    act(() => api().showMe());
  }
};

describe("useTutorial", () => {
  it("starts on the first step with a fresh deal", () => {
    const { result } = renderHook(() => useTutorial());

    expect(result.current.stepIndex).toBe(0);
    expect(result.current.step.id).toBe("goal");
    expect(result.current.finished).toBe(false);
    expect(result.current.nudge).toBeNull();
    expect(JSON.stringify(result.current.deck)).toBe(
      JSON.stringify(dealTutorial().deck)
    );
  });

  it("applies the coached move and advances", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    const redOne = result.current.deck.blurtzPile.cards[2];
    const bankPileId = result.current.bankPiles[0].id;

    act(() => result.current.attemptMove(redOne.id, "tut-blurtz", bankPileId));

    expect(result.current.nudge).toBeNull();
    expect(result.current.stepIndex).toBe(2);
    expect(result.current.deck.blurtzPile.cards).toHaveLength(2);
    expect(result.current.bankPiles[0].cards[0].id).toBe(redOne.id);
  });

  it("refuses a legal move that is not the one being taught, and changes nothing", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    const before = JSON.stringify(result.current.deck);
    const green5 = result.current.deck.workPiles[4].cards[0];
    const red6Pile = result.current.deck.workPiles[1];

    act(() => result.current.attemptMove(green5.id, workPileId(4), red6Pile.id));

    expect(result.current.nudge).toMatch(/not yet/i);
    expect(JSON.stringify(result.current.deck)).toBe(before);
    expect(result.current.stepIndex).toBe(1);
  });

  it("surfaces the engine's own rejection for an illegal move", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    const green2 = result.current.deck.workPiles[3].cards[0];
    const red6Pile = result.current.deck.workPiles[1];

    const expected = validateMove(
      result.current.deck,
      { bankPiles: result.current.bankPiles },
      green2.id,
      workPileId(3),
      red6Pile.id
    );

    act(() => result.current.attemptMove(green2.id, workPileId(3), red6Pile.id));

    expect(expected).not.toBeNull();
    expect(result.current.nudge).toBe(expected);
    expect(result.current.stepIndex).toBe(1);
  });

  it("advances a say step on acknowledge", () => {
    const { result } = renderHook(() => useTutorial());

    act(() => result.current.acknowledge());

    expect(result.current.stepIndex).toBe(1);
    expect(result.current.step.kind).toBe("do");
  });

  it("does nothing on acknowledge during a do step", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    const before = JSON.stringify(result.current.deck);
    act(() => result.current.acknowledge());

    expect(result.current.stepIndex).toBe(1);
    expect(JSON.stringify(result.current.deck)).toBe(before);
  });

  it("performs the required move and advances on show me", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    act(() => result.current.showMe());

    expect(result.current.stepIndex).toBe(2);
    expect(result.current.deck.blurtzPile.cards).toHaveLength(2);
    expect(result.current.bankPiles.some((pile) => pile.cards.length === 1)).toBe(
      true
    );
  });

  it("flips the draw pile without advancing off another step", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());

    const before = JSON.stringify(result.current.deck.drawPile.cards);
    act(() => result.current.flipDraw());

    expect(JSON.stringify(result.current.deck.drawPile.cards)).not.toBe(before);
    expect(result.current.deck.drawPile.cards.at(-1)?.faceUp).toBe(true);
    expect(result.current.stepIndex).toBe(1);
  });

  it("advances when the draw pile is flipped on the draw step", () => {
    const { result } = renderHook(() => useTutorial());
    reachDrawStep(() => result.current);

    expect(result.current.step.id).toBe("draw");

    act(() => result.current.flipDraw());

    expect(result.current.step.id).toBe("blurtz");
  });

  it("refuses to call Blurtz while the Blurtz pile still holds cards", () => {
    const { result } = renderHook(() => useTutorial());

    act(() => result.current.callBlurtz());

    expect(result.current.finished).toBe(false);
    expect(result.current.nudge).toMatch(/not yet/i);
  });

  it("finishes when Blurtz is called on an empty Blurtz pile", () => {
    const { result } = renderHook(() => useTutorial());
    reachDrawStep(() => result.current);
    act(() => result.current.flipDraw());
    act(() => result.current.showMe());

    expect(result.current.deck.blurtzPile.cards).toHaveLength(0);

    act(() => result.current.callBlurtz());

    expect(result.current.finished).toBe(true);
  });

  it("returns to a fresh deal at step zero on restart", () => {
    const { result } = renderHook(() => useTutorial());
    act(() => result.current.acknowledge());
    act(() => result.current.showMe());

    act(() => result.current.restart());

    expect(result.current.stepIndex).toBe(0);
    expect(result.current.finished).toBe(false);
    expect(result.current.nudge).toBeNull();
    expect(JSON.stringify(result.current.deck)).toBe(
      JSON.stringify(dealTutorial().deck)
    );
    expect(result.current.bankPiles.every((pile) => pile.cards.length === 0)).toBe(
      true
    );
  });
});
