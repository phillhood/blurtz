import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Game from "../Game";
import { useAuthStore, useGameStore } from "@stores";
import { socketService, SocketCallbacks } from "@services/socket.service";
import { GameState } from "@types";

/**
 * The round-over interstitial, driven through the REAL store.
 *
 * These pin two things the client had no way to express before rounds existed:
 * that a `round_over` game shows the standings instead of a board, and that
 * readiness is the SERVER's state rather than a local copy the button keeps.
 */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;

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

function player(
  id: string,
  username: string,
  score: number,
  roundScore: number,
  isReady = false
) {
  return {
    id,
    username,
    user: { id: `user-${id}`, username },
    isReady,
    score,
    roundScore,
    bankPileCount: 0,
    deck: {
      blurtzPile: { id: `${id}-b`, type: "blurtz", cards: [] },
      workPiles: [],
      drawPile: { id: `${id}-d`, type: "draw", cards: [] },
    },
  };
}

/** A game sitting between rounds: scored, but nobody has reached the target. */
const roundOverState = (
  players = [player("p1", "alice", 30, 10), player("p2", "bob", 12, -2)]
): GameState =>
  ({
    id: "game-1",
    name: "rounds",
    alias: "ABCD1234",
    maxPlayers: 2,
    currentPlayers: 2,
    status: "round_over",
    hostId: "user-p1",
    players,
    bankPiles: [],
    currentRound: 2,
    targetScore: 100,
    createdAt: new Date(),
  }) as unknown as GameState;

async function registeredCallbacks(): Promise<SocketCallbacks> {
  await useGameStore.getState().initializeSocket("user-p1", "token");
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

describe("the round-over interstitial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({
      gameState: null,
      currentGameId: null,
      connected: false,
      socketInitialized: false,
      error: null,
      moveRejection: null,
    });
    // The current player is alice, who is also the host.
    useAuthStore.setState({
      user: { id: "user-p1", username: "alice" },
    } as never);
  });

  it("shows the round, the target and both scores when a round ends", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    await act(async () => {
      callbacks.onConnect?.();
      callbacks.onRoundOver?.({
        gameState: roundOverState(),
        round: 2,
        calledBy: "p1",
      });
    });

    expect(screen.getByText(/Round over!/i)).toBeInTheDocument();
    // The round number appears twice - the counter and the interstitial's own
    // sentence - so this asserts it is shown, not how many times.
    expect(screen.getAllByText(/Round 2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Playing to 100/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nobody has reached\s*100 yet/i)
    ).toBeInTheDocument();

    // Cumulative totals and this round's score are BOTH shown, and are
    // different numbers - which is the whole distinction rounds introduced.
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    // A round score genuinely goes negative and must not be clamped.
    expect(screen.getByText("-2")).toBeInTheDocument();
  });

  it("lets a player ready up for the next round", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    await act(async () => {
      callbacks.onConnect?.();
      callbacks.onRoundOver?.({
        gameState: roundOverState(),
        round: 2,
        calledBy: "p1",
      });
    });

    const readyButton = screen.getByRole("button", { name: /Ready Up/i });
    expect(readyButton).toBeEnabled();

    await userEvent.click(readyButton);

    expect(socketService.playerReady).toHaveBeenCalledWith("game-1", true);
  });

  /**
   * The regression the old ReadyButton would have shipped: it held `isReady`
   * in local state, so a round advance that cleared readiness on the server
   * left the button still saying "Cancel Ready" - and its effect fired that
   * stale `true` straight back, readying the player for a round they never
   * agreed to.
   */
  it("reflects the SERVER's readiness, not a local copy", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    await act(async () => {
      callbacks.onConnect?.();
      callbacks.onRoundOver?.({
        gameState: roundOverState([
          player("p1", "alice", 30, 10, true),
          player("p2", "bob", 12, -2, false),
        ]),
        round: 2,
        calledBy: "p1",
      });
    });

    // The server says alice is ready, so the button offers to cancel it -
    // without alice having clicked anything in this session.
    expect(
      screen.getByRole("button", { name: /Cancel Ready/i })
    ).toBeInTheDocument();

    // The server clears readiness on a round advance; the button must follow.
    await act(async () => {
      callbacks.onRoundStarted?.({
        gameState: {
          ...roundOverState([
            player("p1", "alice", 30, 0, false),
            player("p2", "bob", 12, 0, false),
          ]),
          status: "playing",
          currentRound: 3,
        } as unknown as GameState,
        round: 3,
      });
    });

    // Back to a playing board - no ready button, and no stale readiness fired.
    expect(
      screen.queryByRole("button", { name: /Cancel Ready/i })
    ).not.toBeInTheDocument();
    expect(socketService.playerReady).not.toHaveBeenCalled();
  });

  // There is no host action between rounds any more. The moment the last
  // player readies up the server deals the next round and broadcasts the fresh
  // `playing` board; while the table is complete the interstitial just says so.
  it("shows a dealing message once everyone is ready, with no host button", async () => {
    const callbacks = await registeredCallbacks();
    renderGame();

    await act(async () => {
      callbacks.onConnect?.();
      callbacks.onRoundOver?.({
        gameState: roundOverState([
          player("p1", "alice", 30, 10, true),
          player("p2", "bob", 12, -2, true),
        ]),
        round: 2,
        calledBy: "p1",
      });
    });

    expect(screen.getByText(/dealing the next round/i)).toBeInTheDocument();
    // No "Start Round N" button, and no "waiting for host" copy - both are gone
    // with the host trigger.
    expect(
      screen.queryByRole("button", { name: /Start Round/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for host/i)).not.toBeInTheDocument();
  });

  it("shows the same dealing message to a non-host, leaving nobody on a dead screen", async () => {
    // bob is not the host - and now sees exactly what the host does.
    useAuthStore.setState({
      user: { id: "user-p2", username: "bob" },
    } as never);

    const callbacks = await registeredCallbacks();
    renderGame();

    await act(async () => {
      callbacks.onConnect?.();
      callbacks.onRoundOver?.({
        gameState: roundOverState([
          player("p1", "alice", 30, 10, true),
          player("p2", "bob", 12, -2, true),
        ]),
        round: 2,
        calledBy: "p1",
      });
    });

    expect(screen.getByText(/dealing the next round/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start Round/i })
    ).not.toBeInTheDocument();
  });
});
