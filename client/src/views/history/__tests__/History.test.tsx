import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MatchHistoryItem } from "@types";
import History from "../History";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const state: { data?: MatchHistoryItem[]; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ user: { id: "u1", username: "designpass" } }),
  useMatchHistory: () => state,
}));

const item = (over: Partial<MatchHistoryItem> = {}): MatchHistoryItem => ({
  gameId: "g1",
  name: "Thursday regulars",
  playedAt: "2026-08-31T10:00:00Z",
  targetScore: 100,
  rounds: 6,
  players: [
    { username: "designpass", finalScore: 104 },
    { username: "corvid", finalScore: 97 },
  ],
  myScore: 104,
  won: true,
  ...over,
});

const renderHistory = () =>
  render(
    <MemoryRouter>
      <History />
    </MemoryRouter>
  );

describe("History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = [item(), item({ gameId: "g2", name: "quick three", won: false })];
    state.isLoading = false;
    state.isError = false;
  });

  it("lists a row per finished game", () => {
    renderHistory();

    expect(screen.getByText("Thursday regulars")).toBeInTheDocument();
    expect(screen.getByText("quick three")).toBeInTheDocument();
  });

  it("waits rather than claiming there is nothing", () => {
    state.data = undefined;
    state.isLoading = true;
    renderHistory();

    expect(screen.queryByText("No finished games yet")).not.toBeInTheDocument();
  });

  it("says so when the player has finished nothing", () => {
    state.data = [];
    renderHistory();

    expect(screen.getByText("No finished games yet")).toBeInTheDocument();
  });

  it("opens a game from its row", async () => {
    renderHistory();

    await userEvent.click(screen.getByRole("button", { name: /Thursday regulars/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/profile/history/g1");
  });

  it("keeps the player oriented when the request fails", () => {
    state.data = undefined;
    state.isError = true;
    renderHistory();

    expect(screen.getByText(/Could not load your match history/i)).toBeInTheDocument();
  });
});
