import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CardColor, ClientCard, GameState, Player, VisibleCard } from "@types";

const mockFlipDrawPile = vi.fn();
const mockCallBlitz = vi.fn();
const gameContext = { gameState: null as GameState | null };

vi.mock("@hooks", () => ({
  useGameContext: () => ({
    flipDrawPile: mockFlipDrawPile,
    callBlitz: mockCallBlitz,
    gameState: gameContext.gameState,
  }),
}));

const PlayerArea = (await import("../components/PlayerArea")).default;

const red: CardColor = { name: "red", type: "a" };
const card = (value: number): VisibleCard =>
  ({ id: `card-${value}`, faceUp: true, value, color: red }) as VisibleCard;

/** A face-down card, as the server publishes one: an id and nothing else. */
const faceDown = (id: string): ClientCard => ({ id, faceUp: false }) as ClientCard;

const player = (over: {
  blurtz?: ClientCard[];
  draw?: ClientCard[];
  work?: VisibleCard[][];
  bankPileCount?: number;
} = {}): Player =>
  ({
    id: "player-1",
    user: { id: "user-1", username: "ada" },
    bankPileCount: over.bankPileCount,
    deck: {
      blurtzPile: {
        id: "blurtz-1",
        type: "blurtz",
        cards: over.blurtz ?? [card(1)],
      },
      // The draw pile's face-DOWN cards are the stock. `?? [faceDown(...)]` is
      // the normal case: a stock with something left to turn over.
      drawPile: {
        id: "draw-1",
        type: "draw",
        cards: over.draw ?? [faceDown("stock-1")],
      },
      workPiles: (over.work ?? [[card(3)]]).map((cards, i) => ({
        id: `work-${i}`,
        type: "work",
        cards,
      })),
    },
  }) as unknown as Player;

/** The stock's clickable face-down top card. */
const stockTop = () =>
  screen
    .getAllByTestId("game-card")
    .filter((card) => card.getAttribute("data-face-down") === "true")[0];

const Board = ({ children }: { children: React.ReactNode }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
};

const renderArea = (
  props: Partial<React.ComponentProps<typeof PlayerArea>> = {}
) =>
  render(
    <Board>
      <PlayerArea
        player={player()}
        isCurrentPlayer
        opponentCount={0}
        {...props}
      />
    </Board>
  );

describe("PlayerArea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameContext.gameState = { id: "game-1", status: "playing" } as GameState;
  });

  it("shows the player's name and score", () => {
    renderArea({ player: player({ bankPileCount: 7 }) });

    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("Score: 7")).toBeInTheDocument();
  });

  it("shows a zero score rather than nothing before any card is banked", () => {
    // bankPileCount is undefined until the first move lands.
    renderArea({ player: player() });

    expect(screen.getByText("Score: 0")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // The Blurtz button. Calling Blurtz is how a round ends and how it is
  // scored, and it is only legal with an empty blurtz pile - so when this
  // button exists is a rule, not decoration.
  // ------------------------------------------------------------------
  it("offers Blurtz once the blurtz pile is empty", () => {
    renderArea({ player: player({ blurtz: [] }) });

    expect(screen.getByRole("button", { name: "BLURTZ!" })).toBeInTheDocument();
  });

  it("does not offer Blurtz while the blurtz pile still has cards", () => {
    renderArea({ player: player({ blurtz: [card(1)] }) });

    expect(screen.queryByRole("button", { name: "BLURTZ!" })).not.toBeInTheDocument();
  });

  it("never offers Blurtz on an opponent's area", () => {
    // Opponents' areas render through the same component. A Blurtz button over
    // someone else's empty pile would call the round in their name.
    renderArea({
      player: player({ blurtz: [] }),
      isCurrentPlayer: false,
      opponentCount: 1,
    });

    expect(screen.queryByRole("button", { name: "BLURTZ!" })).not.toBeInTheDocument();
  });

  it("does not offer Blurtz in a game that is not being played", () => {
    gameContext.gameState = { id: "game-1", status: "round_over" } as GameState;

    renderArea({ player: player({ blurtz: [] }) });

    // The round is already over - the pile is empty because it was just won.
    expect(screen.queryByRole("button", { name: "BLURTZ!" })).not.toBeInTheDocument();
  });

  it("calls Blurtz when the button is pressed", async () => {
    renderArea({ player: player({ blurtz: [] }) });

    await userEvent.setup().click(screen.getByRole("button", { name: "BLURTZ!" }));

    expect(mockCallBlitz).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // The draw pile. Flipping is the player's only source of new cards, and
  // flipping someone else's - or an empty one - is a move the server refuses.
  // ------------------------------------------------------------------
  it("flips the player's own stock on click", async () => {
    renderArea({ player: player({ draw: [faceDown("stock-1")] }) });

    await userEvent.setup().click(stockTop());

    expect(mockFlipDrawPile).toHaveBeenCalledTimes(1);
  });

  it("does not flip a draw pile with nothing in it", async () => {
    renderArea({ player: player({ draw: [] }) });

    // Nothing to turn over at all. The stock renders as a placeholder, and
    // clicking it must not ask the server to flip an empty pile.
    await userEvent.setup().click(screen.getByText("Click to reset"));

    expect(mockFlipDrawPile).not.toHaveBeenCalled();
  });

  it("does not flip an opponent's stock", async () => {
    renderArea({
      player: player({ draw: [faceDown("stock-1")] }),
      isCurrentPlayer: false,
      opponentCount: 1,
    });

    // Opponents' areas render through this same component. Flipping their
    // stock is not the player's to do.
    await userEvent.setup().click(stockTop());

    expect(mockFlipDrawPile).not.toHaveBeenCalled();
  });

  it("does not flip the stock once the game is finished", async () => {
    // The cursor and the click read one predicate: if they diverge, a finished
    // board emits a flip the server only refuses after a round trip.
    gameContext.gameState = { id: "game-1", status: "finished" } as GameState;

    renderArea({ player: player({ draw: [faceDown("stock-1")] }) });

    await userEvent.setup().click(stockTop());

    expect(mockFlipDrawPile).not.toHaveBeenCalled();
  });

  it("does not flip the stock between rounds", async () => {
    // round_over is the other non-playing status a board sits in with a stock
    // still full of cards, and it is the one a player is most likely to click:
    // the interstitial is live and the cards are right there.
    gameContext.gameState = { id: "game-1", status: "round_over" } as GameState;

    renderArea({ player: player({ draw: [faceDown("stock-1")] }) });

    await userEvent.setup().click(stockTop());

    expect(mockFlipDrawPile).not.toHaveBeenCalled();
  });

  it("renders an opponent's area without making it playable", () => {
    const { container } = renderArea({
      player: player({ work: [[card(3)]] }),
      isCurrentPlayer: false,
      opponentCount: 1,
    });

    // Visible, but nothing in it can be picked up: dragging an opponent's card
    // is a move that exists only to be refused.
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(container.querySelector("[style*='cursor: grab']")).toBeNull();
  });

  it("makes the player's own cards draggable while the game is playing", () => {
    const { container } = renderArea({ player: player({ work: [[card(3)]] }) });

    expect(container.querySelector("[style*='cursor: grab']")).not.toBeNull();
  });

  it("makes nothing draggable once the game is over", () => {
    gameContext.gameState = { id: "game-1", status: "finished" } as GameState;

    const { container } = renderArea({ player: player({ work: [[card(3)]] }) });

    expect(container.querySelector("[style*='cursor: grab']")).toBeNull();
  });

  // ------------------------------------------------------------------
  // Presence. A dropped player is not a player who is thinking, and in a game
  // where nobody waits on anybody the board is the only place that can say so.
  // ------------------------------------------------------------------
  describe("presence", () => {
    it("says so when the player is not connected", () => {
      renderArea({ isConnected: false });

      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("says nothing when the player is connected", () => {
      renderArea({ isConnected: true });

      expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
    });

    it("treats a caller that passes no presence as connected", () => {
      // The default has to be "fine": a caller that knows nothing about
      // presence must not paint the whole table as dropped.
      renderArea({});

      expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
    });

    it("dims a dropped player's cards without taking them away", () => {
      const { container } = renderArea({
        player: player({ work: [[card(3)]] }),
        isConnected: false,
      });

      // The board is still live - the server plays no move for them and they
      // may be back before the round ends.
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(container.querySelector("[style*='opacity: 0.5']")).not.toBeNull();
    });

    it("leaves a connected player's cards undimmed", () => {
      const { container } = renderArea({
        player: player({ work: [[card(3)]] }),
        isConnected: true,
      });

      expect(container.querySelector("[style*='opacity: 0.5']")).toBeNull();
    });
  });
});
