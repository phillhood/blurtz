import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import WorkPilesComponent from "../components/WorkPilesComponent";
import BankPilesArea from "../components/BankPilesArea";
import { CardColor, ClientCard, Pile, VisibleCard } from "@types";

const red: CardColor = { name: "red", code: "#dc2626", type: "a" };
const card = (value: number): VisibleCard =>
  ({ id: `card-${value}`, faceUp: true, value, color: red }) as VisibleCard;
const faceDown = (id: string): ClientCard => ({ id, faceUp: false }) as ClientCard;

const pile = (id: string, cards: ClientCard[] = []): Pile =>
  ({ id, type: "work", cards }) as unknown as Pile;

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

describe("WorkPilesComponent", () => {
  it("renders nothing when the decks have not been dealt", () => {
    // The gap between "game started" and the first state arriving: players
    // exist, work piles do not.
    renderIn(
      <WorkPilesComponent
        workPiles={[]}
        canDropOnPile={() => true}
        isDraggable
        isCurrentPlayer
      />
    );

    expect(screen.getByTestId("root")).toBeEmptyDOMElement();
  });

  it("draws every work pile the player was dealt", () => {
    // The count varies by player count (WORK_PILE_MAPPING on the server), so
    // this must render what it is given rather than a fixed three.
    renderIn(
      <WorkPilesComponent
        workPiles={[
          pile("work-0", [card(9)]),
          pile("work-1", [card(8)]),
          pile("work-2", [card(7)]),
          pile("work-3", [card(6)]),
        ]}
        canDropOnPile={() => true}
        isDraggable
        isCurrentPlayer
      />
    );

    for (const value of ["9", "8", "7", "6"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("shows a work pile's cards face-up, all the way down", () => {
    // A work pile is dealt face-up and the server refuses to move a face-down
    // card onto one. Both cards must be readable, not just the top.
    renderIn(
      <WorkPilesComponent
        workPiles={[pile("work-0", [card(9), card(8)])]}
        canDropOnPile={() => true}
        isDraggable
        isCurrentPlayer
      />
    );

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("filters out a face-down card rather than rendering a back in a work pile", () => {
    // `pile.cards.filter(isVisibleCard)` states the invariant to the type
    // system. If a face-down card ever arrived, it must not be drawn as a
    // playable card in a pile that is supposed to be entirely face-up.
    renderIn(
      <WorkPilesComponent
        workPiles={[pile("work-0", [faceDown("h-1"), card(8)])]}
        canDropOnPile={() => true}
        isDraggable
        isCurrentPlayer
      />
    );

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("NB")).not.toBeInTheDocument();
  });

  it("makes the current player's top card draggable", () => {
    const { container } = renderIn(
      <WorkPilesComponent
        workPiles={[pile("work-0", [card(9)])]}
        canDropOnPile={() => true}
        isDraggable
        isCurrentPlayer
      />
    );

    expect(container.querySelector("[style*='cursor: grab']")).not.toBeNull();
  });

  it("makes an opponent's work piles look but not touch", () => {
    const { container } = renderIn(
      <WorkPilesComponent
        workPiles={[pile("work-0", [card(9)])]}
        canDropOnPile={() => true}
        isDraggable={false}
        isCurrentPlayer={false}
      />
    );

    // Visible - the whole point of an opponent's board is that you can read it.
    expect(screen.getByText("9")).toBeInTheDocument();
    // But not draggable, and no drop zone: you cannot play onto their tableau.
    expect(container.querySelector("[style*='cursor: grab']")).toBeNull();
  });
});

describe("BankPilesArea", () => {
  it("labels the shared foundations", () => {
    renderIn(<BankPilesArea bankPiles={[]} canDropOnPile={() => true} />);

    expect(screen.getByText("Bank")).toBeInTheDocument();
  });

  it("shows only the bank piles that have been started", () => {
    // The server holds 16 bank pile slots. Drawing an empty card frame for
    // every one of them would bury the board. Card value 4 rather than 1 so it
    // cannot be confused with the "1" on the new-pile placeholder.
    renderIn(
      <BankPilesArea
        bankPiles={[
          pile("bank-0", [card(4)]),
          pile("bank-1", []),
          pile("bank-2", []),
        ]}
        canDropOnPile={() => true}
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    // One started pile plus exactly one placeholder - not two empty frames.
    expect(screen.getAllByText("1")).toHaveLength(1);
  });

  it("offers exactly one place to start a new bank pile", () => {
    // Every empty slot is equivalent, so showing more than one is noise - but
    // showing none would make a fresh Ace unplayable.
    renderIn(
      <BankPilesArea
        bankPiles={[pile("bank-0", []), pile("bank-1", []), pile("bank-2", [])]}
        canDropOnPile={() => true}
      />
    );

    // The placeholder is labelled "1": a bank pile can only ever start on a 1.
    expect(screen.getAllByText("1")).toHaveLength(1);
  });

  it("offers no new-pile slot once every bank pile is in use", () => {
    renderIn(
      <BankPilesArea
        bankPiles={[pile("bank-0", [card(4)]), pile("bank-1", [card(7)])]}
        canDropOnPile={() => true}
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    // No "1" placeholder - there is nowhere left to start one.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows a started pile's top card and hides what is under it", () => {
    // A bank pile builds 1..10 ascending. Only the top matters, and the cards
    // beneath it are depth.
    renderIn(
      <BankPilesArea
        bankPiles={[pile("bank-0", [card(1), card(2), card(3)])]}
        canDropOnPile={() => true}
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("never makes a banked card draggable", () => {
    // A card played to the bank is gone - it scores and stays. Dragging one
    // back out is not a move this game has.
    const { container } = renderIn(
      <BankPilesArea
        bankPiles={[pile("bank-0", [card(1)])]}
        canDropOnPile={vi.fn()}
      />
    );

    expect(container.querySelector("[style*='cursor: grab']")).toBeNull();
  });
});
