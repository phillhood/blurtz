import { describe, it, expect } from "vitest";
import { isVisibleCard, cardHue } from "../card.utils";
import { CardColor, ClientCard, VisibleCard } from "@types";

const red: CardColor = { name: "red", type: "a" };

const visible = (value: number): VisibleCard =>
  ({ id: `c-${value}`, faceUp: true, value, color: red }) as VisibleCard;

/** What the server actually puts on the wire for a card you may not see. */
const hidden = (id: string): ClientCard =>
  ({ id, faceUp: false }) as ClientCard;

describe("isVisibleCard", () => {
  it("accepts a face-up card and rejects a face-down one", () => {
    expect(isVisibleCard(visible(5))).toBe(true);
    expect(isVisibleCard(hidden("h-1"))).toBe(false);
  });

  it("narrows a filtered array to cards whose face may be read", () => {
    // The reason this is a type predicate and not a bare `c => c.faceUp`:
    // `filter` carries the narrowing, so `.value` below is readable without
    // re-proving itself at every call site.
    const cards: ClientCard[] = [visible(3), hidden("h-1"), visible(7)];

    const shown = cards.filter(isVisibleCard);

    // No cast, no `!`. This line only compiles because the predicate narrowed.
    expect(shown.map((c) => c.value)).toEqual([3, 7]);
    expect(shown).toHaveLength(2);
  });

  it("keeps a redacted card out of anything that reads a face", () => {
    // A hidden card carries an id and nothing else. If this ever returned true
    // for one, the UI would read `.value` off it and render `undefined` where
    // the server deliberately sent nothing.
    const onlyHidden: ClientCard[] = [hidden("h-1"), hidden("h-2")];
    expect(onlyHidden.filter(isVisibleCard)).toEqual([]);
  });
});

describe("cardHue", () => {
  it("maps each of the four suits to a distinct token", () => {
    const hues = ["red", "blue", "green", "yellow"].map((name) =>
      cardHue({ name, type: "a" } as CardColor)
    );
    // Four suits that render the same colour would make the game unplayable;
    // that they are distinct matters more than which token each one is.
    expect(new Set(hues).size).toBe(4);
  });

  it("matches the suit name case-insensitively", () => {
    // The engine ships "Red"; fixtures and older decks say "red".
    expect(cardHue({ name: "Red", type: "a" } as CardColor)).toBe(
      cardHue({ name: "red", type: "a" } as CardColor)
    );
  });

  it("returns a token reference rather than a hex", () => {
    // The whole point of the indirection: repainting the game is a change to
    // the stylesheet, never to the domain or to a stored deck.
    expect(cardHue({ name: "red", type: "a" } as CardColor)).toMatch(
      /^var\(--color-card-/
    );
  });

  it("yields a usable colour rather than undefined for an unknown suit", () => {
    // The return value goes straight into a `color:` style; undefined would
    // render as the browser default rather than as anything anyone chose.
    expect(cardHue({ name: "puce", type: "a" } as CardColor)).toBe(
      "var(--color-card-unknown)"
    );
    expect(cardHue({ type: "a" } as CardColor)).toBe(
      "var(--color-card-unknown)"
    );
  });
});
