import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Game from "../Game";
import { useAuthStore, useGameStore } from "@stores";
import { socketService, SocketCallbacks } from "@services/socket.service";
import { GameState } from "@types";

/**
 * These tests drive the REAL store through <Game>, on purpose. The defect they
 * pin down lives in the seam between the two: the store chose which field to
 * put a rejection reason in, and the view decided fatality by grepping that
 * field. Either half looks fine alone.
 */
vi.mock("@services/socket.service", () => ({
  socketService: {
    setCallbacks: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    joinGame: vi.fn(),
    leaveGame: vi.fn(),
    forfeitGame: vi.fn(),
    moveCard: vi.fn(),
    flipCard: vi.fn(),
    callBlitz: vi.fn(),
    playerReady: vi.fn(),
    startGame: vi.fn(),
    connected: true,
  },
}));

/**
 * A live game the player is sitting in. No players and no bank piles keeps the
 * board cheap to render - what is under test is which screen renders, not what
 * is on it.
 */
const playingState = (id: string): GameState =>
  ({
    id,
    name: "race",
    alias: "ABCD1234",
    maxPlayers: 2,
    currentPlayers: 2,
    status: "playing",
    hostId: "user-1",
    players: [],
    bankPiles: [],
    currentRound: 1,
    createdAt: new Date(),
  }) as unknown as GameState;

async function registeredCallbacks(): Promise<SocketCallbacks> {
  await useGameStore.getState().initializeSocket("user-1", "token");
  const setCallbacks = socketService.setCallbacks as unknown as {
    mock: { calls: SocketCallbacks[][] };
  };
  return setCallbacks.mock.calls.at(-1)![0];
}

const renderGame = () =>
  render(
    <MemoryRouter initialEntries={["/game/game-1"]}>
      <Routes>
        <Route path="/game/:gameId" element={<Game />} />
      </Routes>
    </MemoryRouter>
  );

describe("<Game> and a rejected move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "user-1", username: "tester" } as never });
    useGameStore.setState({
      gameState: playingState("game-1"),
      currentGameId: "game-1",
      connected: true,
      socketInitialized: false,
      error: null,
      moveRejection: null,
      userJoined: true,
      userLeft: false,
    });
  });

  // -------------------------------------------------------------------
  // Task 6 item 1: <Game> decides fatality with
  //   error?.includes("not found") || error?.includes("does not exist")
  // and validateMove can reject with "Source pile not found" / "Destination
  // pile not found". Routing a rejection reason through `error` therefore
  // unmounts a player out of a live game over a bad pile id - the exact
  // opposite of what MOVE_REJECTED exists to do.
  // -------------------------------------------------------------------
  it.each([
    "Destination pile not found",
    "Source pile not found",
  ])("does not fall into the fatal error screen when a move is rejected with %j", async (reason) => {
    const callbacks = await registeredCallbacks();
    renderGame();

    act(() => {
      callbacks.onMoveRejected!({ gameState: playingState("game-1"), reason });
    });

    // The fatal screen is the regression: a routine rejection must never
    // replace the board with it.
    expect(screen.queryByText("Game Error")).not.toBeInTheDocument();
    expect(screen.queryByText("Back to Dashboard")).not.toBeInTheDocument();

    // The player is still in their game, looking at it.
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
  });

  it("still surfaces the rejection reason to the player as a transient message", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    act(() => {
      callbacks.onMoveRejected!({
        gameState: playingState("game-1"),
        reason: "Destination pile not found",
      });
    });

    // Not silently swallowed - it just is not fatal.
    expect(screen.getByText("Destination pile not found")).toBeInTheDocument();
  });

  it("keeps genuinely fatal errors fatal", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    act(() => {
      callbacks.onError!("Game not found");
    });

    // The heuristic still does its job on the channel it was written for.
    expect(screen.getByText("Game Error")).toBeInTheDocument();
    expect(screen.getByText("Game not found")).toBeInTheDocument();
  });
});
