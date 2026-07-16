import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import Game from "../Game";

const mockJoinGame = vi.fn();
const mockLeaveGame = vi.fn();
const mockMakeMove = vi.fn();
const mockClearError = vi.fn();

const mockClearMoveRejection = vi.fn();

const gameContextState = {
  gameState: null as unknown,
  connected: true,
  error: null as string | null,
  moveRejection: null as string | null,
  currentPlayer: undefined as unknown,
};

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ user: { id: "user-1", username: "testuser" } }),
  useGameContext: () => ({
    gameState: gameContextState.gameState,
    joinGame: mockJoinGame,
    leaveGame: mockLeaveGame,
    makeMove: mockMakeMove,
    connected: gameContextState.connected,
    error: gameContextState.error,
    clearError: mockClearError,
    moveRejection: gameContextState.moveRejection,
    clearMoveRejection: mockClearMoveRejection,
    currentPlayer: gameContextState.currentPlayer,
  }),
}));

/**
 * A live game the player is sitting in, with one dealt player and no bank
 * piles - enough for the board to render, cheap enough that what is under test
 * stays "which screen renders", not what is drawn on it.
 */
const playingState = () =>
  ({
    id: "game-1",
    name: "race",
    alias: "ABCD1234",
    status: "playing",
    hostId: "user-1",
    maxPlayers: 2,
    currentPlayers: 2,
    currentRound: 1,
    targetScore: 75,
    bankPiles: [],
    players: [
      {
        id: "player-1",
        username: "testuser",
        score: 0,
        isReady: true,
        user: { id: "user-1", username: "testuser" },
        deck: {
          blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
          workPiles: [],
          drawPile: { id: "draw-1", type: "draw", cards: [] },
        },
      },
    ],
  }) as unknown as ReturnType<typeof Object>;

// A sibling component that exposes react-router navigation so tests can
// move between two games *without* remounting <Game />, the same way the
// app's real navigation works (same route, different :gameId param).
const Navigator = ({ to }: { to: string }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>navigate</button>;
};

const renderGame = (initialPath: string, navigateTo?: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      {navigateTo && <Navigator to={navigateTo} />}
      <Routes>
        <Route path="/game/:gameId" element={<Game />} />
      </Routes>
    </MemoryRouter>
  );

describe("Game", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameContextState.gameState = null;
    gameContextState.connected = true;
    gameContextState.error = null;
    gameContextState.moveRejection = null;
    gameContextState.currentPlayer = undefined;
  });

  it("joins the game from the current gameId route param on mount", () => {
    renderGame("/game/game-1");

    expect(mockJoinGame).toHaveBeenCalledTimes(1);
    expect(mockJoinGame).toHaveBeenCalledWith("game-1");
  });

  it("re-joins with the new gameId when navigating game -> game without a remount", async () => {
    const user = userEvent.setup();
    renderGame("/game/game-1", "/game/game-2");

    expect(mockJoinGame).toHaveBeenCalledTimes(1);
    expect(mockJoinGame).toHaveBeenNthCalledWith(1, "game-1");

    await user.click(screen.getByText("navigate"));

    // The bug: a stale ref captured at mount would still say "game-1" here,
    // so the client would ask to join the room it just left instead of the
    // new one.
    expect(mockJoinGame).toHaveBeenCalledTimes(2);
    expect(mockJoinGame).toHaveBeenNthCalledWith(2, "game-2");
  });

  it("does not show the fatal error screen behind a redirect - GameErrorScreen renders instead of navigating away", () => {
    gameContextState.error = "Game not found";

    renderGame("/game/missing-game");

    expect(screen.getByText("Game not found")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Which screen the player is looking at. <Game> has four mutually
  // exclusive ones and picks between them in order, so what matters is not
  // only that each renders but that the right one WINS.
  // ---------------------------------------------------------------------
  describe("which screen renders", () => {
    it("waits for the socket before anything else", () => {
      gameContextState.connected = false;

      renderGame("/game/game-1");

      expect(screen.getByText("Connecting to game server...")).toBeInTheDocument();
      // No socket, no room to join - asking would throw inside the store.
      expect(mockJoinGame).not.toHaveBeenCalled();
    });

    it("shows the board's loading screen once connected but before state lands", () => {
      renderGame("/game/game-1");

      expect(screen.getByText("Loading game...")).toBeInTheDocument();
      expect(screen.getByText(/game-1/)).toBeInTheDocument();
    });

    it("puts a fatal error ahead of the loading screen", () => {
      // Both conditions hold at once - no gameState AND a fatal error. Showing
      // "Loading game..." for a game that does not exist spins forever.
      gameContextState.error = "Game not found";
      gameContextState.gameState = null;

      renderGame("/game/game-1");

      expect(screen.getByText("Game not found")).toBeInTheDocument();
      expect(screen.queryByText("Loading game...")).not.toBeInTheDocument();
    });

    it("treats a 'does not exist' error as fatal too", () => {
      gameContextState.error = "That game does not exist";

      renderGame("/game/game-1");

      expect(screen.getByText("That game does not exist")).toBeInTheDocument();
    });

    it("renders the board once the game is playing", () => {
      gameContextState.gameState = playingState();
      gameContextState.currentPlayer = (
        playingState() as { players: unknown[] }
      ).players[0];

      renderGame("/game/game-1");

      expect(screen.getByText("Game in progress!")).toBeInTheDocument();
      // The bank is the board: it only renders on the playing branch.
      expect(screen.getByText("Bank")).toBeInTheDocument();
      expect(screen.queryByText("Loading game...")).not.toBeInTheDocument();
    });

    it("does not render the board for a game that has not started", () => {
      // A waiting lobby has no decks dealt yet. The board reads
      // `player.deck.workPiles` off every seat, so drawing it before the deal
      // would read piles off players who have none.
      gameContextState.gameState = { ...playingState(), status: "waiting" };

      renderGame("/game/game-1");

      expect(screen.queryByText("Bank")).not.toBeInTheDocument();
    });
  });

  describe("leaving", () => {
    /**
     * The confirm dialog's own subtree. The header's leave button is ALSO
     * labelled "Forfeit" while a game is playing, so "the Forfeit button" is
     * ambiguous the moment the dialog is up.
     */
    const forfeitDialog = () =>
      within(screen.getByText("Forfeit Game").closest("div")!.parentElement!);

    const playing = () => {
      gameContextState.gameState = playingState();
      gameContextState.currentPlayer = (
        playingState() as { players: unknown[] }
      ).players[0];
    };

    it("leaves a game that has not started, without asking", async () => {
      gameContextState.gameState = { ...playingState(), status: "waiting" };
      const user = userEvent.setup();
      renderGame("/game/game-1");

      await user.click(screen.getByRole("button", { name: "Leave Game" }));

      // Nothing to forfeit in a lobby - a confirmation here is a click the
      // player has to make for no reason.
      expect(screen.queryByText("Forfeit Game")).not.toBeInTheDocument();
      expect(mockLeaveGame).toHaveBeenCalledWith();
    });

    it("asks before letting a player forfeit a live game", async () => {
      playing();
      const user = userEvent.setup();
      renderGame("/game/game-1");

      await user.click(screen.getByRole("button", { name: "Forfeit" }));

      // Leaving a game in progress concedes it. Doing that on one misclick,
      // silently, is the difference between a misclick and a loss.
      expect(screen.getByText("Forfeit Game")).toBeInTheDocument();
      expect(mockLeaveGame).not.toHaveBeenCalled();
    });

    it("forfeits when the player confirms", async () => {
      playing();
      const user = userEvent.setup();
      renderGame("/game/game-1");

      await user.click(screen.getByRole("button", { name: "Forfeit" }));
      await user.click(forfeitDialog().getByRole("button", { name: "Forfeit" }));

      // `true` is the forfeit flag. Without it the store refuses to leave a
      // playing game at all, and the button would do nothing at all.
      expect(mockLeaveGame).toHaveBeenCalledWith(true);
    });

    it("stays in the game when the player backs out", async () => {
      playing();
      const user = userEvent.setup();
      renderGame("/game/game-1");

      await user.click(screen.getByRole("button", { name: "Forfeit" }));
      await user.click(forfeitDialog().getByRole("button", { name: "Cancel" }));

      expect(mockLeaveGame).not.toHaveBeenCalled();
      expect(screen.queryByText("Forfeit Game")).not.toBeInTheDocument();
      // Still at the table.
      expect(screen.getByText("Game in progress!")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // The toast. Two channels feed it and only one of them is allowed to be
  // fatal, so which one wins - and which one is even eligible - is the
  // whole point.
  // ---------------------------------------------------------------------
  describe("the transient toast", () => {
    it("shows a refused move without taking the board down", () => {
      gameContextState.gameState = playingState();
      gameContextState.moveRejection = "That card no longer fits on that bank pile";

      renderGame("/game/game-1");

      expect(
        screen.getByText("That card no longer fits on that bank pile")
      ).toBeInTheDocument();
      expect(screen.getByText("Game in progress!")).toBeInTheDocument();
    });

    it("shows a non-fatal error", () => {
      gameContextState.gameState = playingState();
      gameContextState.error = "It is not your turn";

      renderGame("/game/game-1");

      expect(screen.getByText("It is not your turn")).toBeInTheDocument();
      expect(screen.getByText("Game in progress!")).toBeInTheDocument();
    });

    it("prefers the refused move when both channels have something to say", () => {
      // An opponent's error and the player's own rejected move can coexist.
      // The one the player caused is the one they need explained.
      gameContextState.gameState = playingState();
      gameContextState.moveRejection = "Destination pile not found";
      gameContextState.error = "It is not your turn";

      renderGame("/game/game-1");

      expect(screen.getByText("Destination pile not found")).toBeInTheDocument();
      expect(screen.queryByText("It is not your turn")).not.toBeInTheDocument();
    });

    it("shows no toast when there is nothing to say", () => {
      gameContextState.gameState = playingState();

      renderGame("/game/game-1");

      expect(mockClearMoveRejection).not.toHaveBeenCalled();
      expect(mockClearError).not.toHaveBeenCalled();
    });
  });
});
