import { describe, it, expect } from "vitest";
import { validateMove, executeMove, flipDrawPile } from "@blurtz/shared";
import { TUTORIAL_STEPS, dealTutorial } from "../script";

const replay = () => {
  const { deck, bankPiles } = dealTutorial();
  const board = { bankPiles };
  const rejections: string[] = [];

  for (const step of TUTORIAL_STEPS) {
    if (step.kind === "say") {
      continue;
    }
    if (step.id === "draw") {
      deck.drawPile.cards = flipDrawPile(deck.drawPile.cards);
      continue;
    }
    const move = step.requires?.(deck, bankPiles) ?? null;
    if (!move) {
      rejections.push(`${step.id}: could not resolve its move`);
      continue;
    }
    const rejection = validateMove(
      deck,
      board,
      move.cardId,
      move.fromPileId,
      move.toPileId
    );
    if (rejection) {
      rejections.push(`${step.id}: ${rejection}`);
      continue;
    }
    executeMove(deck, board, move.cardId, move.fromPileId, move.toPileId);
  }

  return { deck, bankPiles, rejections };
};

describe("the tutorial script", () => {
  it("deals exactly one player's forty cards", () => {
    const { deck } = dealTutorial();
    const count =
      deck.blurtzPile.cards.length +
      deck.workPiles.reduce((total, pile) => total + pile.cards.length, 0) +
      deck.drawPile.cards.length;

    expect(count).toBe(40);
  });

  it("deals no card twice", () => {
    const { deck } = dealTutorial();
    const ids = [
      ...deck.blurtzPile.cards,
      ...deck.workPiles.flatMap((pile) => pile.cards),
      ...deck.drawPile.cards,
    ].map((card) => card.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("teaches eight steps", () => {
    expect(TUTORIAL_STEPS).toHaveLength(8);
  });

  it("gives every do step an instruction to show", () => {
    const missing = TUTORIAL_STEPS.filter(
      (step) => step.kind === "do" && !step.instruction
    );

    expect(missing).toEqual([]);
  });

  it("only ever asks for a move the real engine accepts", () => {
    expect(replay().rejections).toEqual([]);
  });

  it("ends with the Blurtz pile empty, which is what calling Blurtz needs", () => {
    expect(replay().deck.blurtzPile.cards).toHaveLength(0);
  });

  it("banks two cards along the way, so the score has something in it", () => {
    const banked = replay().bankPiles.reduce(
      (total, pile) => total + pile.cards.length,
      0
    );

    expect(banked).toBe(2);
  });

  it("says out loud that the Blurtz pile is short, so nobody learns a wrong number", () => {
    const { deck } = dealTutorial();

    expect(deck.blurtzPile.cards).toHaveLength(3);
    expect(TUTORIAL_STEPS[0].say).toMatch(/ten/i);
    expect(TUTORIAL_STEPS[0].say).toMatch(/three/i);
  });
});
