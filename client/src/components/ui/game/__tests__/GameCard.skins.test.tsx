import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameCard, CARD_GEOMETRY } from "../GameCard";

describe("card geometry", () => {
  it("keeps the emissive overline inside the strip a fanned card still shows", () => {
    expect(CARD_GEOMETRY.overlineRatio).toBeLessThan(
      CARD_GEOMETRY.fanOffsetRatio
    );
  });
});

describe("GameCard", () => {
  it("paints from the hue it is given", () => {
    render(
      <GameCard hue="var(--color-card-red)" cardType="a" size="play">
        7
      </GameCard>
    );
    expect(screen.getByTestId("game-card")).toHaveStyle({
      "--hue": "var(--color-card-red)",
    });
  });

  it("marks its type so the skin can render a cue", () => {
    render(
      <GameCard hue="var(--color-card-yellow)" cardType="b" size="play">
        2
      </GameCard>
    );
    expect(screen.getByTestId("game-card")).toHaveAttribute("data-card-type", "b");
  });

  it("names its size so the board can scale it without prop drilling pixels", () => {
    render(
      <GameCard hue="var(--color-card-blue)" cardType="a" size="foundation">
        4
      </GameCard>
    );
    expect(screen.getByTestId("game-card")).toHaveAttribute(
      "data-card-size",
      "foundation"
    );
  });
});

describe("the emissive skin", () => {
  it("leaves a face-down card's back alone at every size", () => {
    // The token override paints from `--hue`; a face-down card's hue is the
    // unknown-colour token, so without the exclusion a card back renders as a
    // pale slate rectangle instead of the deck pattern.
    const { container } = render(
      <div className="skin-emissive">
        <GameCard
          hue="var(--color-card-unknown)"
          cardType="a"
          size="token"
          faceDown
        />
      </div>
    );
    const card = container.querySelector("[data-face-down='true']");
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("data-card-size", "token");
  });
});
