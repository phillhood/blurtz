import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Game } from "@types";

const mockNavigate = vi.fn();
const mockCreateAndJoinGame = vi.fn();

const games = {
  activeGames: [] as Game[],
  availableGames: [] as Game[],
  loading: false,
  refetch: vi.fn(),
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ user: { id: "user-1", username: "designpass" } }),
  useGameContext: () => ({ createAndJoinGame: mockCreateAndJoinGame }),
  useGames: () => games,
  useUserStats: () => ({ gamesPlayed: 5, gamesWon: 2, winRate: 40 }),
}));

vi.mock("@services/game.service", () => ({
  gameService: { joinGame: vi.fn(), createGame: vi.fn() },
}));

const { gameService } = await import("@services/game.service");
const Dashboard = (await import("../Dashboard")).default;

const game = (id: string, name: string, over: Partial<Game> = {}): Game =>
  ({
    id,
    name,
    alias: `alias-${id}`,
    status: "waiting",
    maxPlayers: 4,
    currentPlayers: 1,
    targetScore: 100,
    currentRound: 1,
    hostUsername: "corvid",
    createdAt: new Date(2024, 0, 3),
    ...over,
  }) as Game;

const renderDashboard = (over: Partial<typeof games> = {}) => {
  Object.assign(games, over);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return userEvent.setup();
};

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    games.activeGames = [
      game("game-mine", "Thursday regulars", { status: "playing", currentPlayers: 4 }),
    ];
    games.availableGames = [
      game("game-1", "Midnight rush"),
      game("game-2", "Open Game"),
    ];
    games.loading = false;
  });

  it("leads with the tables waiting on the player", () => {
    renderDashboard();

    expect(
      screen.getByRole("heading", { name: /Good .+, designpass/ })
    ).toBeInTheDocument();
    expect(screen.getByText("1 table waiting on you")).toBeInTheDocument();
  });

  it("puts the player's own tables above the open ones", () => {
    renderDashboard();

    const names = screen.getAllByRole("button", { name: /Rejoin|Join$/ });

    expect(names[0]).toHaveAccessibleName("Rejoin");
  });

  it("says so when there is nothing to join", () => {
    renderDashboard({ activeGames: [], availableGames: [] });

    expect(screen.getByText("No open tables")).toBeInTheDocument();
  });

  it("shows a loading screen only until the first games arrive", () => {
    games.loading = true;
    games.activeGames = [];
    games.availableGames = [];
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText("Loading dashboard...")).toBeInTheDocument();
    unmount();

    // A background refetch keeps `loading` true while games are already on
    // screen. Blanking the whole dashboard for it would flash on every poll.
    games.loading = true;
    games.availableGames = [game("game-1", "Open Game")];
    renderDashboard();
    expect(screen.queryByText("Loading dashboard...")).not.toBeInTheDocument();
  });

  it("navigates into a game created through the modal", async () => {
    mockCreateAndJoinGame.mockResolvedValue({ id: "game-new" });
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "New table" }));
    await user.type(screen.getByPlaceholderText("Enter game name..."), "Friday");
    await user.click(screen.getByRole("button", { name: "Create Game" }));

    expect(mockCreateAndJoinGame).toHaveBeenCalledWith("Friday", 2, false, 100);
    // Creating a game and staying on the lobby leaves the player's own game
    // waiting for them somewhere they cannot see.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/game/game-new")
    );
  });

  it("stays put when the create fails", async () => {
    // createAndJoinGame answers null on failure and puts the reason on the
    // store's error channel. Navigating to /game/undefined would be worse.
    mockCreateAndJoinGame.mockResolvedValue(null);
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "New table" }));
    await user.type(screen.getByPlaceholderText("Enter game name..."), "Friday");
    await user.click(screen.getByRole("button", { name: "Create Game" }));

    await waitFor(() => expect(mockCreateAndJoinGame).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("joins a listed game by id and goes there", async () => {
    games.availableGames = [game("game-2", "Open Game")];
    vi.mocked(gameService.joinGame).mockResolvedValue(game("game-2", "Open Game"));
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() =>
      expect(gameService.joinGame).toHaveBeenCalledWith({ id: "game-2" })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/game/game-2"));
  });

  it("joins by code through the join modal", async () => {
    vi.mocked(gameService.joinGame).mockResolvedValue(game("game-3", "Coded"));
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Join by code" }));
    await user.type(
      screen.getByPlaceholderText("e.g., happy-blue-lemur"),
      "happy-blue-cat"
    );
    await user.click(screen.getByRole("button", { name: "Join Game" }));

    // An alias must go to joinByCode; joinById would 404 on a game code.
    await waitFor(() =>
      expect(gameService.joinGame).toHaveBeenCalledWith({ alias: "happy-blue-cat" })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/game/game-3"));
  });

  it("does not navigate when the join is refused", async () => {
    games.availableGames = [game("game-2", "Open Game")];
    vi.mocked(gameService.joinGame).mockRejectedValue(new Error("Game is full"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(gameService.joinGame).toHaveBeenCalled());
    // Navigating into a game the server refused would land on a board that
    // immediately errors out.
    expect(mockNavigate).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("refreshes the lobby on demand", async () => {
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(games.refetch).toHaveBeenCalled();
  });

  it("opens and closes the create modal without creating anything", async () => {
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "New table" }));
    expect(screen.getByText("Create New Game")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(mockCreateAndJoinGame).not.toHaveBeenCalled();
  });

  it("opens and closes the join modal without joining anything", async () => {
    const user = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Join by code" }));
    expect(screen.getByText("Join Game by Code")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Join Game by Code")).not.toBeInTheDocument()
    );
    expect(gameService.joinGame).not.toHaveBeenCalled();
  });
});
