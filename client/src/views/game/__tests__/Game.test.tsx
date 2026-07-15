import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import Game from "../Game";

const mockJoinGame = vi.fn();
const mockLeaveGame = vi.fn();
const mockMakeMove = vi.fn();
const mockClearError = vi.fn();

const gameContextState = {
  gameState: null as unknown,
  connected: true,
  error: null as string | null,
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
    currentPlayer: gameContextState.currentPlayer,
  }),
}));

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
});
