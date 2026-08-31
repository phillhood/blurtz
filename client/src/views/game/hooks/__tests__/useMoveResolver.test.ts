import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMoveResolver } from "../useMoveResolver";
import { CARD_COLORS } from "@blurtz/shared";
import type { ClientCard, Pile, VisibleCard } from "@types";

const { RED, BLUE, YELLOW } = CARD_COLORS;

const card = (id: string, value: number, color = RED): VisibleCard =>
  ({ id, faceUp: true, value, color }) as VisibleCard;

const pile = (id: string, type: string, cards: ClientCard[]): Pile =>
  ({ id, type, cards }) as unknown as Pile;

const setup = (bank: Pile[], work: Pile[]) =>
  renderHook(() => useMoveResolver(bank, work)).result.current;

describe("useMoveResolver", () => {
  it("accepts the next value up in the same colour on a bank pile", () => {
    const r = setup([pile("bank-0", "bank", [card("b1", 4)])], []);
    expect(r.resolve(card("c", 5), "work-0", "bank-0")).toMatchObject({
      toPileId: "bank-0",
      toType: "bank",
    });
  });

  it("refuses a wrong-colour bank move", () => {
    const r = setup([pile("bank-0", "bank", [card("b1", 4, RED)])], []);
    expect(r.resolve(card("c", 5, BLUE), "work-0", "bank-0")).toBeNull();
  });

  it("refuses a move back onto the pile it came from", () => {
    const r = setup([], [pile("work-0", "work", [card("w1", 5)])]);
    expect(r.resolve(card("w1", 5), "work-0", "work-0")).toBeNull();
  });

  it("carries the stack above a card on a work-to-work move", () => {
    const work = [
      pile("work-0", "work", [card("a", 5, RED), card("b", 4, YELLOW)]),
      // Type b, so a type-a red 5 may legally sit on this 6 - work piles
      // alternate colour type, they do not merely descend.
      pile("work-1", "work", [card("c", 6, YELLOW)]),
    ];
    const r = setup([], work);
    const resolved = r.resolve(card("a", 5, RED), "work-0", "work-1");
    expect(resolved?.movingCardIds).toEqual(["a", "b"]);
  });

  it("carries only the card itself on a work-to-bank move", () => {
    const work = [pile("work-0", "work", [card("a", 5, RED), card("b", 4, YELLOW)])];
    const r = setup([pile("bank-0", "bank", [card("x", 3, YELLOW)])], work);
    const resolved = r.resolve(card("b", 4, YELLOW), "work-0", "bank-0");
    expect(resolved?.movingCardIds).toEqual(["b"]);
  });

  it("refuses a face-down card outright", () => {
    const r = setup([pile("bank-0", "bank", [])], []);
    const hidden = { id: "h", faceUp: false } as ClientCard;
    expect(r.resolve(hidden, "draw-0", "bank-0")).toBeNull();
  });

  it("lists every pile a card may legally reach", () => {
    const bank = [
      pile("bank-0", "bank", [card("b", 4, RED)]),
      pile("bank-1", "bank", [card("b2", 9, BLUE)]),
    ];
    const work = [pile("work-1", "work", [card("w", 6, YELLOW)])];
    const targets = setup(bank, work).legalTargetIds(card("c", 5, RED), "work-0");
    expect(targets).toContain("bank-0");
    expect(targets).not.toContain("bank-1");
  });
});
