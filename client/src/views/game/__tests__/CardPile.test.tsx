import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import CardPile from "../components/CardPile";
import FannedCards from "../components/FannedCards";
import { CardColor, ClientCard, VisibleCard } from "@types";

const red: CardColor = { name: "red", code: "#dc2626", type: "a" };

const visible = (value: number): VisibleCard =>
  ({ id: `card-${value}`, faceUp: true, value, color: red }) as VisibleCard;

const hidden = (id: string): ClientCard => ({ id, faceUp: false }) as ClientCard;

/** The board as <Game> configures it - see Card.test.tsx for why. */
const Board = ({ children }: { children: React.ReactNode }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
};

const renderIn = (node: React.ReactNode) =>
  render(
    <Board>
      <div data-testid="root">{node}</div>
    </Board>
  );

describe("CardPile", () => {
  it("renders nothing for an empty pile", () => {
    renderIn(<CardPile cards={[]} pileId="pile-1" />);

    expect(screen.getByTestId("root")).toBeEmptyDOMElement();
  });

  it("shows the top card, which is the LAST one in the array", () => {
    // The array convention is top-at-the-end. Reading it the other way would
    // show the bottom of every pile in the game.
    renderIn(<CardPile cards={[visible(3), visible(9)]} pileId="pile-1" />);

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // The stack behind the top card is depth, not information.
  // ---------------------------------------------------------------------
  it("draws the cards behind the top one as backs, never as faces", () => {
    renderIn(
      <CardPile cards={[visible(2), visible(5), visible(9)]} pileId="pile-1" />
    );

    // Only the top card's value is on screen. The two behind it render as
    // backs even though the test handed them face-up: this pile claims to
    // show one card, and showing the ones under it would leak the order of a
    // work pile to anyone who looked.
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getAllByText("NB")).toHaveLength(2);
  });

  it("caps how many backs are drawn behind the top card", () => {
    // Values 2..9, so the top card (9) cannot be confused with the count
    // badge (8).
    const cards = [2, 3, 4, 5, 6, 7, 8, 9].map(visible);

    renderIn(<CardPile cards={cards} pileId="pile-1" />);

    // Default maxStackDisplay is 2 - a 10-card blurtz pile must not render 10
    // DOM nodes deep on every state swap.
    expect(screen.getAllByText("NB")).toHaveLength(2);
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("honours a custom stack depth", () => {
    const cards = [1, 2, 3, 4, 5].map(visible);

    renderIn(<CardPile cards={cards} pileId="pile-1" maxStackDisplay={4} />);

    expect(screen.getAllByText("NB")).toHaveLength(4);
  });

  it("draws no backs behind a single card", () => {
    renderIn(<CardPile cards={[visible(9)]} pileId="pile-1" />);

    expect(screen.queryByText("NB")).not.toBeInTheDocument();
  });

  it("counts the pile only when there is more than one card in it", () => {
    const { unmount } = renderIn(<CardPile cards={[visible(9)]} pileId="pile-1" />);
    // A badge reading "1" on a single card is noise.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    unmount();

    renderIn(<CardPile cards={[visible(2), visible(5), visible(9)]} pileId="pile-1" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the count when asked", () => {
    renderIn(
      <CardPile
        cards={[visible(2), visible(5), visible(9)]}
        pileId="pile-1"
        hideCountBadge
      />
    );

    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("passes a click on the pile through", async () => {
    const onClick = vi.fn();
    renderIn(<CardPile cards={[visible(9)]} pileId="pile-1" onClick={onClick} />);

    await userEvent.setup().click(screen.getByText("9"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("will not let a face-down top card be dragged, however draggable the pile is", () => {
    // The blurtz pile's top card is face-down until it is flipped. Dragging a
    // card nobody can see is a move the server would refuse anyway.
    const { container } = renderIn(
      <CardPile cards={[hidden("h-1")]} pileId="pile-1" isDraggable />
    );

    expect(container.querySelector("[style*='cursor: grab']")).toBeNull();
  });

  it("lets a face-up top card be dragged when the pile allows it", () => {
    const { container } = renderIn(
      <CardPile cards={[visible(9)]} pileId="pile-1" isDraggable />
    );

    expect(container.querySelector("[style*='cursor: grab']")).not.toBeNull();
  });

  it("hides the top card while its move is in flight", () => {
    const { container } = renderIn(
      <CardPile
        cards={[visible(9)]}
        pileId="pile-1"
        pendingMoveCardIds={new Set(["card-9"])}
      />
    );

    expect(container.querySelector("[style*='opacity: 0']")).not.toBeNull();
  });

  it("leaves a card alone when some OTHER card's move is in flight", () => {
    const { container } = renderIn(
      <CardPile
        cards={[visible(9)]}
        pileId="pile-1"
        pendingMoveCardIds={new Set(["card-4"])}
      />
    );

    expect(container.querySelector("[style*='opacity: 0;']")).toBeNull();
  });
});

describe("FannedCards", () => {
  it("renders nothing for an empty pile", () => {
    renderIn(<FannedCards cards={[]} pileId="draw-1" />);

    expect(screen.getByTestId("root")).toBeEmptyDOMElement();
  });

  it("fans the LAST cards, which are the most recent flips", () => {
    // The draw pile appends flipped cards to the end. Showing the first three
    // would show the oldest flips and hide the card the player can play.
    const cards = [1, 2, 3, 4, 5].map(visible);

    renderIn(<FannedCards cards={cards} pileId="draw-1" />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("shows every card when there are fewer than the maximum", () => {
    renderIn(<FannedCards cards={[visible(1), visible(2)]} pileId="draw-1" />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("honours a custom fan width", () => {
    const cards = [1, 2, 3, 4, 5].map(visible);

    renderIn(<FannedCards cards={cards} pileId="draw-1" maxDisplay={2} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("makes only the top card draggable", () => {
    // Draw-pile rules: three cards are visible, one is playable. A draggable
    // card underneath would offer a move the server refuses.
    const { container } = renderIn(
      <FannedCards cards={[visible(1), visible(2), visible(3)]} pileId="draw-1" isDraggable />
    );

    expect(container.querySelectorAll("[style*='cursor: grab']")).toHaveLength(1);
    expect(container.querySelectorAll("[style*='cursor: default']")).toHaveLength(2);
  });

  it("drags nothing when the pile is not draggable", () => {
    const { container } = renderIn(
      <FannedCards cards={[visible(1), visible(2), visible(3)]} pileId="draw-1" />
    );

    expect(container.querySelectorAll("[style*='cursor: grab']")).toHaveLength(0);
  });

  it("hides only the card whose move is in flight", () => {
    const { container } = renderIn(
      <FannedCards
        cards={[visible(1), visible(2), visible(3)]}
        pileId="draw-1"
        pendingMoveCardIds={new Set(["card-3"])}
      />
    );

    // The two behind it must stay put - only the dragged card resolves.
    expect(container.querySelectorAll("[style*='opacity: 0;']")).toHaveLength(1);
  });
});
