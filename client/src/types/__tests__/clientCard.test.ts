import { describe, expect, it } from "vitest";
import { ClientCard, HiddenCard, VisibleCard } from "@types";
import { isVisibleCard } from "@utils";

/**
 * The ClientCard union's contract.
 *
 * Half of this suite is the `@ts-expect-error` lines, which assert a COMPILE
 * error rather than a runtime one - `tsc --noEmit` fails if any of them ever
 * starts compiling. That is the real guard: if someone widens `HiddenCard` to
 * carry a value again, or drops the `faceUp: true`/`false` literal types that
 * make this a discriminated union, these stop erroring and the build breaks
 * loudly instead of quietly re-opening the leak.
 *
 * Vitest runs the file for the runtime assertions; tsc checks it for the rest.
 */

const hidden: HiddenCard = { id: "hidden:draw-pile-1:0", faceUp: false };

const visible: VisibleCard = {
  id: "real-card-id",
  value: 7,
  color: { name: "Red", type: "a" },
  faceUp: true,
};

describe("ClientCard", () => {
  describe("a hidden card cannot be read", () => {
    it("has no value, number or color - at the type level", () => {
      // @ts-expect-error - a face-down card has no value. The server does not
      // send one, and reading it must not compile.
      const value = hidden.value;
      // @ts-expect-error - nor a colour.
      const color = hidden.color;
      // @ts-expect-error - `number` is not a field on ANY card any more: it
      // was an alias of `value` that only the client read, and the two agreed
      // only because createFullDeck wrote both. This line erroring is now
      // over-determined - hidden cards carry nothing, and nothing carries
      // `number` - which is exactly the point.
      const number = hidden.number;

      // At runtime they are simply absent, which is the whole point.
      expect(value).toBeUndefined();
      expect(color).toBeUndefined();
      expect(number).toBeUndefined();
    });

    it("carries only an id and faceUp", () => {
      expect(Object.keys(hidden).sort()).toEqual(["faceUp", "id"]);
    });
  });

  describe("the union does not leak through an unnarrowed read", () => {
    it("refuses .value on a ClientCard that has not been narrowed", () => {
      const card: ClientCard = hidden;

      // @ts-expect-error - could be either member, so the read is refused
      // until `faceUp` has been checked. This is the compile error that makes
      // reading an opponent's hidden card impossible rather than merely
      // discouraged.
      const value = card.value;

      expect(value).toBeUndefined();
    });
  });

  describe("narrowing restores full access", () => {
    it("reads a face-up card's face once faceUp is checked", () => {
      const card: ClientCard = visible;

      // No error here: this is the payoff. The check IS the narrowing, and it
      // is the same early return Card.tsx already had.
      if (!card.faceUp) throw new Error("expected a visible card");

      expect(card.value).toBe(7);
      expect(card.color.name).toBe("Red");
    });

    it("narrows through isVisibleCard, including in a filter", () => {
      const cards: ClientCard[] = [hidden, visible];

      const values = cards.filter(isVisibleCard).map((c) => c.value);

      expect(values).toEqual([7]);
    });
  });
});
