import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import CardComponent from "../components/Card";
import { CardColor, ClientCard, VisibleCard } from "@types";

const red: CardColor = { name: "red", type: "a" };
const yellow: CardColor = { name: "yellow", type: "b" };

const visible = (value: number, color: CardColor = red): VisibleCard =>
  ({ id: `card-${value}`, faceUp: true, value, color }) as VisibleCard;

/**
 * A face-down card as the server ACTUALLY publishes it: an id, a faceUp flag,
 * and nothing else. No value, no colour - `redactCard` does not send them.
 */
const hidden = (id = "hidden-1"): ClientCard =>
  ({ id, faceUp: false }) as ClientCard;

/**
 * The board, configured the way <Game> configures it.
 *
 * The 5px activation constraint is not decoration: with dnd-kit's default
 * sensors a bare pointerdown starts a drag and swallows the click that follows.
 * `distance: 5` keeps a click a click - a harness without it reports that
 * clicking a card does nothing, which is a fact about the harness.
 */
const Board = ({ children }: { children: React.ReactNode }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
};

const renderCard = (
  props: Partial<React.ComponentProps<typeof CardComponent>> & {
    card: ClientCard;
  }
) =>
  render(
    <Board>
      {/* Scopes assertions to the card: DndContext also renders its own
          screen-reader instructions into the container. */}
      <div data-testid="card-root">
        <CardComponent pileId="pile-1" {...props} />
      </div>
    </Board>
  );

describe("Card", () => {
  it("renders a face-up card's value", () => {
    renderCard({ card: visible(7) });

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  // `!card.faceUp`'s early return IS the type narrowing: everything below it
  // reads `card.color` and `card.value`, which a HiddenCard does not have.
  it("renders the back of a face-down card and no value at all", () => {
    renderCard({ card: hidden() });

    expect(screen.getByTestId("game-card")).toHaveAttribute(
      "data-face-down",
      "true"
    );
    // Nothing but the back, anywhere in the card. A regression that dropped
    // the early return would render `undefined` here rather than throw.
    expect(screen.getByTestId("card-root").textContent).toBe("");
    expect(screen.getByTestId("card-root").textContent).not.toMatch(/\d/);
  });

  it("does not render the back for a card that is face-up", () => {
    renderCard({ card: visible(3) });

    expect(screen.queryByText("NB")).not.toBeInTheDocument();
  });

  it("tells the two colour types apart by card type, not by colour name", () => {
    // Red/blue and yellow/green share a type, and hue alone is not enough for a
    // colourblind player. The type is the second channel, and the skin decides
    // whether it renders as a rail or as a bracketed numeral.
    const { container: typeA } = renderCard({ card: visible(5, red) });
    expect(typeA.querySelector("[data-card-type='a']")).not.toBeNull();

    const { container: typeB } = renderCard({ card: visible(5, yellow) });
    expect(typeB.querySelector("[data-card-type='b']")).not.toBeNull();
  });

  it("calls back when a face-up card is clicked", async () => {
    const onClick = vi.fn();
    renderCard({ card: visible(7), onClick });

    await userEvent.setup().click(screen.getByText("7"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls back when a face-down card is clicked", async () => {
    // The blurtz pile's top card and the draw pile are both clicked while
    // face-down - the early return must not cost the card its click handler.
    const onClick = vi.fn();
    renderCard({ card: hidden(), onClick });

    await userEvent.setup().click(screen.getByTestId("game-card"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("survives a click with no handler wired", async () => {
    renderCard({ card: visible(7) });

    await userEvent.setup().click(screen.getByText("7"));

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("marks a card whose move is still in flight", () => {
    // The card used to vanish for a round trip - hidden at source with nothing
    // at the destination, so it existed nowhere. It now stays on screen in a
    // committed-but-unconfirmed state until the server answers.
    renderCard({ card: visible(7), isPendingMove: true });

    expect(screen.getByTestId("game-card")).toHaveAttribute(
      "data-in-flight",
      "true"
    );
  });

  it("shows a card that is not moving", () => {
    const { container } = renderCard({ card: visible(7), isPendingMove: false });

    expect(container.querySelector("[style*='opacity: 0;']")).toBeNull();
  });

  it("offers a grab cursor only on a card that can be dragged", () => {
    const { container: draggable } = renderCard({ card: visible(7) });
    expect(draggable.querySelector("[style*='cursor: grab']")).not.toBeNull();

    const { container: fixed } = renderCard({
      card: visible(7),
      isDraggable: false,
    });
    // An opponent's cards render through here too. A grab cursor on one is a
    // promise the game does not keep.
    expect(fixed.querySelector("[style*='cursor: grab']")).toBeNull();
    expect(fixed.querySelector("[style*='cursor: default']")).not.toBeNull();
  });
});
