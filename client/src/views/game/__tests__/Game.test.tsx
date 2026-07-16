import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import Game from "../Game";
import { GameError } from "@types";
import { SOCKET_ERROR_CODES } from "@blurtz/shared";

const mockJoinGame = vi.fn();
const mockLeaveGame = vi.fn();
const mockMakeMove = vi.fn();
const mockClearError = vi.fn();

const mockClearMoveRejection = vi.fn();

const gameContextState = {
  gameState: null as unknown,
  connected: true,
  reconnecting: false,
  connectedUserIds: null as string[] | null,
  error: null as GameError | null,
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
    reconnecting: gameContextState.reconnecting,
    connectedUserIds: gameContextState.connectedUserIds,
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

/** The same board with an opponent sitting across it, for the presence tests. */
const withOpponent = () => {
  const state = playingState() as { players: unknown[] };
  state.players.push({
    id: "player-2",
    username: "grace",
    score: 0,
    isReady: true,
    user: { id: "user-2", username: "grace" },
    deck: {
      blurtzPile: { id: "blurtz-2", type: "blurtz", cards: [] },
      workPiles: [],
      drawPile: { id: "draw-2", type: "draw", cards: [] },
    },
  });
  return state;
};

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
    gameContextState.reconnecting = false;
    gameContextState.connectedUserIds = null;
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
    gameContextState.error = {
      code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
      message: "Game not found",
    };

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
      gameContextState.error = {
        code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
        message: "Game not found",
      };
      gameContextState.gameState = null;

      renderGame("/game/game-1");

      expect(screen.getByText("Game not found")).toBeInTheDocument();
      expect(screen.queryByText("Loading game...")).not.toBeInTheDocument();
    });

    it("treats being no player of this game as fatal too", () => {
      gameContextState.error = {
        code: SOCKET_ERROR_CODES.NOT_A_PLAYER,
        message: "You are not a player in this game",
      };

      renderGame("/game/game-1");

      expect(
        screen.getByText("You are not a player in this game")
      ).toBeInTheDocument();
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

  // A drop mid-game is not the same event as a socket that has never been up.
  // The board is still meaningful while the connection is not, and the game runs
  // on without the player either way - so taking it away costs them their place
  // and tells them nothing.
  describe("reconnecting", () => {
    const dropped = () => {
      gameContextState.gameState = playingState();
      gameContextState.currentPlayer = (
        playingState() as { players: unknown[] }
      ).players[0];
      gameContextState.connected = false;
      gameContextState.reconnecting = true;
    };

    it("keeps the board up while the socket is being retried", () => {
      dropped();

      renderGame("/game/game-1");

      expect(screen.getByText("Bank")).toBeInTheDocument();
      expect(
        screen.queryByText("Connecting to game server...")
      ).not.toBeInTheDocument();
    });

    it("says it is reconnecting when the socket drops", () => {
      dropped();

      renderGame("/game/game-1");

      expect(
        screen.getByText("Reconnecting to game server...")
      ).toBeInTheDocument();
    });

    it("stops saying so once the socket is back", () => {
      gameContextState.gameState = playingState();
      gameContextState.connected = true;
      gameContextState.reconnecting = false;

      renderGame("/game/game-1");

      expect(
        screen.queryByText("Reconnecting to game server...")
      ).not.toBeInTheDocument();
    });

    it("still waits full-screen for a socket that has never connected", () => {
      gameContextState.gameState = playingState();
      gameContextState.connected = false;
      gameContextState.reconnecting = false;

      renderGame("/game/game-1");

      // Nothing is being retried and there is no board worth keeping - this is
      // the first connect, which the loading screen is right for.
      expect(
        screen.getByText("Connecting to game server...")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Reconnecting to game server...")
      ).not.toBeInTheDocument();
    });

    it("re-joins the room once the socket comes back", () => {
      dropped();
      const { rerender } = renderGame("/game/game-1");

      expect(mockJoinGame).not.toHaveBeenCalled();

      gameContextState.connected = true;
      gameContextState.reconnecting = false;
      rerender(
        <MemoryRouter initialEntries={["/game/game-1"]}>
          <Routes>
            <Route path="/game/:gameId" element={<Game />} />
          </Routes>
        </MemoryRouter>
      );

      // Rejoining is what fetches fresh state: the board the player kept
      // looking at went stale the moment the socket went down.
      expect(mockJoinGame).toHaveBeenCalledWith("game-1");
    });
  });

  // A dropped opponent used to be indistinguishable from one who was thinking:
  // the server said PLAYER_LEFT with no state and the client ignored it.
  describe("presence", () => {
    const atTheTable = () => {
      gameContextState.gameState = withOpponent();
      gameContextState.currentPlayer = (withOpponent() as { players: unknown[] })
        .players[0];
    };

    it("marks an opponent the server has stopped seeing as disconnected", () => {
      atTheTable();
      gameContextState.connectedUserIds = ["user-1"];

      renderGame("/game/game-1");

      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("leaves a connected opponent unmarked", () => {
      atTheTable();
      gameContextState.connectedUserIds = ["user-1", "user-2"];

      renderGame("/game/game-1");

      expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
    });

    it("marks nobody until the server has said who is there", () => {
      atTheTable();
      gameContextState.connectedUserIds = null;

      renderGame("/game/game-1");

      // Unknown is not absent. Painting the whole table as dropped because a
      // frame has not landed yet is a worse lie than a moment's silence.
      expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
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
      gameContextState.error = {
        code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
        message: "It is not your turn",
      };

      renderGame("/game/game-1");

      expect(screen.getByText("It is not your turn")).toBeInTheDocument();
      expect(screen.getByText("Game in progress!")).toBeInTheDocument();
    });

    it("prefers the refused move when both channels have something to say", () => {
      // An opponent's error and the player's own rejected move can coexist.
      // The one the player caused is the one they need explained.
      gameContextState.gameState = playingState();
      gameContextState.moveRejection = "Destination pile not found";
      gameContextState.error = {
        code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
        message: "It is not your turn",
      };

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

  // ---------------------------------------------------------------------
  // Fatality is decided by `error.code` and nothing else. The message is for
  // the player to read: the moment code reads it, any routine failure worded
  // "... not found" throws someone out of a game they are still playing.
  // ---------------------------------------------------------------------
  describe("which errors are fatal", () => {
    const inALiveGame = () => {
      gameContextState.gameState = playingState();
      gameContextState.currentPlayer = (
        playingState() as { players: unknown[] }
      ).players[0];
    };

    // The bank only renders on the playing branch, so its presence is the
    // board's presence.
    const boardIsStillUp = () => {
      expect(screen.queryByText("Game Error")).not.toBeInTheDocument();
      expect(screen.getByText("Bank")).toBeInTheDocument();
    };

    it("keeps the board up for a transient error whose message says 'not found'", () => {
      inALiveGame();
      gameContextState.error = {
        code: SOCKET_ERROR_CODES.PLAYER_NOT_FOUND,
        message: "Player not found in this game",
      };

      renderGame("/game/game-1");

      boardIsStillUp();
      // Not swallowed either - it just is not fatal.
      expect(
        screen.getByText("Player not found in this game")
      ).toBeInTheDocument();
    });

    it("keeps the board up for a code it does not recognise", () => {
      inALiveGame();
      gameContextState.error = {
        code: "SOME_CODE_FROM_A_NEWER_SERVER",
        message: "Game not found, apparently",
      };

      renderGame("/game/game-1");

      boardIsStillUp();
    });

    it("keeps the board up for an error the client raised itself", () => {
      inALiveGame();
      gameContextState.error = { code: null, message: "Failed to make move" };

      renderGame("/game/game-1");

      boardIsStillUp();
    });

    it.each([SOCKET_ERROR_CODES.GAME_NOT_FOUND, SOCKET_ERROR_CODES.NOT_A_PLAYER])(
      "replaces the board with the error screen on %s",
      (code) => {
        inALiveGame();
        gameContextState.error = { code, message: "this game is not yours" };

        renderGame("/game/game-1");

        expect(screen.getByText("Game Error")).toBeInTheDocument();
        expect(screen.queryByText("Bank")).not.toBeInTheDocument();
      }
    );
  });
});
