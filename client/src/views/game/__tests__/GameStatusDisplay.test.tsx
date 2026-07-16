import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameState } from "@types";

const gameContext = {
  gameState: null as GameState | null,
  currentPlayer: null as unknown,
  playerReady: vi.fn(),
  startNextRound: vi.fn(),
};

vi.mock("@hooks", () => ({
  useGameContext: () => gameContext,
  useAuthContext: () => ({ user: { id: "user-1", username: "ada" } }),
}));

const GameStatusDisplay = (await import("../components/GameStatusDisplay")).default;

const state = (over: Partial<GameState> = {}): GameState =>
  ({
    id: "game-1",
    alias: "happy-blue-cat",
    status: "waiting",
    currentPlayers: 1,
    maxPlayers: 2,
    currentRound: 1,
    targetScore: 75,
    players: [{ id: "player-1", username: "ada", user: { id: "user-1", username: "ada" } }],
    ...over,
  }) as unknown as GameState;

/**
 * The banner above the board: what the game is doing, and what the player is
 * waiting on. Every branch here swaps a different screen underneath it.
 */
describe("GameStatusDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameContext.gameState = state();
    gameContext.currentPlayer = { id: "player-1", user: { id: "user-1" } };
  });

  it("counts a waiting game's players", () => {
    render(<GameStatusDisplay />);

    expect(screen.getByText("Waiting for players... (1/2)")).toBeInTheDocument();
  });

  it("says the game is in progress once it starts", () => {
    gameContext.gameState = state({ status: "playing", currentPlayers: 2 });

    render(<GameStatusDisplay />);

    expect(screen.getByText("Game in progress!")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // `gameState.winner` is a Player id. The heading wants a name, and the
  // roster is the only place one exists - this used to greet the winner
  // with a UUID.
  // ------------------------------------------------------------------
  it("names the winner of a finished game", () => {
    gameContext.gameState = state({
      status: "finished",
      currentPlayers: 2,
      winner: "player-2",
      players: [
        { id: "player-1", username: "ada", score: 30, user: { id: "user-1", username: "ada" } },
        { id: "player-2", username: "bob", score: 75, user: { id: "user-2", username: "bob" } },
      ],
    } as unknown as Partial<GameState>);

    render(<GameStatusDisplay />);

    expect(screen.getByText("Game finished! - Winner: bob")).toBeInTheDocument();
    expect(screen.queryByText(/player-2/)).not.toBeInTheDocument();
  });

  it("says a game finished even when nobody won it", () => {
    // Everybody forfeited: readGameState resolves `winner: null`.
    gameContext.gameState = state({
      status: "finished",
      currentPlayers: 2,
      winner: null,
      players: [
        { id: "player-1", username: "ada", score: 30, user: { id: "user-1", username: "ada" } },
      ],
    } as unknown as Partial<GameState>);

    render(<GameStatusDisplay />);

    expect(screen.getByText("Game finished!")).toBeInTheDocument();
  });

  it("does not count rounds in a lobby that has never been dealt", () => {
    // A waiting lobby has no round 1 yet; showing one implies a game in
    // progress that the player is somehow not seeing.
    render(<GameStatusDisplay />);

    expect(screen.queryByText(/Round 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Playing to/)).not.toBeInTheDocument();
  });

  it("counts the round in every state where a round exists", () => {
    for (const status of ["playing", "round_over", "finished"] as const) {
      gameContext.gameState = state({
        status,
        currentPlayers: 2,
        currentRound: 3,
        targetScore: 75,
      });

      const { unmount } = render(<GameStatusDisplay />);

      // Multi-round scoring is the whole game: a player who cannot see which
      // round it is or what they are playing to cannot tell a Blitz worth
      // calling from one that loses. `getAllBy` because the round-over and
      // finished screens name the round again underneath the counter.
      expect(screen.getAllByText(/Round 3/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Playing to 75/).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("shares the game code only while there is room for someone to use it", () => {
    render(<GameStatusDisplay />);
    expect(screen.getByText("happy-blue-cat")).toBeInTheDocument();

    // A full game's code is an invitation to a game nobody can join.
    gameContext.gameState = state({
      currentPlayers: 2,
      maxPlayers: 2,
      players: [
        { id: "player-1", username: "ada", user: { id: "user-1", username: "ada" } },
        { id: "player-2", username: "bob", user: { id: "user-2", username: "bob" } },
      ],
    } as unknown as Partial<GameState>);
    const { container } = render(<GameStatusDisplay />);
    expect(container.querySelector("[title='Copy game code']")).toBeNull();
  });

  it("copies the game code to the clipboard and says it did", async () => {
    const user = userEvent.setup();
    render(<GameStatusDisplay />);

    await user.click(screen.getByTitle("Copy game code"));

    // Read it back off the clipboard rather than asserting the call: the code
    // is the only way into a private game, and what matters is that it is
    // actually there to paste.
    expect(await navigator.clipboard.readText()).toBe("happy-blue-cat");
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("does not offer a round counter's defaults as real numbers", () => {
    // currentRound/targetScore are optional on the wire. `?? 1` and `?? 0` are
    // the fallbacks - what matters is that neither renders "undefined".
    gameContext.gameState = state({
      status: "playing",
      currentPlayers: 2,
      currentRound: undefined,
      targetScore: undefined,
    } as unknown as Partial<GameState>);

    render(<GameStatusDisplay />);

    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText(/Playing to 0/)).toBeInTheDocument();
  });

  it("renders without a game state rather than throwing", () => {
    // The frame between mounting <Game> and the room answering.
    gameContext.gameState = null;

    render(<GameStatusDisplay />);

    expect(screen.getByText("Waiting for players... (0/2)")).toBeInTheDocument();
  });
});
