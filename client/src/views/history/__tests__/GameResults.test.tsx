import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GameResultsDetail } from "@types";
import GameResults from "../GameResults";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ gameId: "g1" }) };
});

const state: { data?: GameResultsDetail; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("@hooks", () => ({
  useAuthContext: () => ({ user: { id: "u1", username: "designpass" } }),
  useGameResults: () => state,
}));

const detail: GameResultsDetail = {
  gameId: "g1",
  name: "Thursday regulars",
  targetScore: 100,
  winnerUsername: "designpass",
  rounds: [
    {
      round: 1,
      results: [
        { username: "designpass", roundScore: 18, cumulativeScore: 18, bankPileCount: 6, blurtzRemaining: 0, calledBlurtz: true },
        { username: "corvid", roundScore: 12, cumulativeScore: 12, bankPileCount: 5, blurtzRemaining: 3, calledBlurtz: false },
      ],
    },
    {
      round: 2,
      results: [
        { username: "designpass", roundScore: 86, cumulativeScore: 104, bankPileCount: 9, blurtzRemaining: 0, calledBlurtz: true },
        { username: "corvid", roundScore: 85, cumulativeScore: 97, bankPileCount: 8, blurtzRemaining: 1, calledBlurtz: false },
      ],
    },
  ],
};

const renderResults = () =>
  render(
    <MemoryRouter>
      <GameResults />
    </MemoryRouter>
  );

describe("GameResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = detail;
    state.isLoading = false;
    state.isError = false;
  });

  it("names the game and how it ended", () => {
    renderResults();

    expect(screen.getByRole("heading", { name: "Thursday regulars" })).toBeInTheDocument();
    expect(screen.getByText(/first to 100/i)).toBeInTheDocument();
  });

  it("shows the chart and the table together, not one behind a toggle", () => {
    const { container } = renderResults();

    expect(screen.getByRole("img", { name: /Cumulative score/i })).toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("tallies the viewer's own game", () => {
    renderResults();

    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("52.0")).toBeInTheDocument();
  });

  it("places a viewer who did not win, by score", () => {
    state.data = {
      ...detail,
      winnerUsername: "corvid",
      rounds: [
        detail.rounds[0],
        {
          round: 2,
          results: [
            { username: "designpass", roundScore: 40, cumulativeScore: 58, bankPileCount: 4, blurtzRemaining: 2, calledBlurtz: false },
            { username: "corvid", roundScore: 90, cumulativeScore: 102, bankPileCount: 9, blurtzRemaining: 0, calledBlurtz: true },
          ],
        },
      ],
    };
    renderResults();

    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
  });

  it("refuses without claiming the game does not exist", () => {
    state.data = undefined;
    state.isError = true;
    renderResults();

    expect(screen.getByText(/not yours to view/i)).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });
});
