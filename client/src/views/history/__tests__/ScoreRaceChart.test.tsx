import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameResultsDetail } from "@types";
import ScoreRaceChart from "../components/ScoreRaceChart";

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
        { username: "designpass", roundScore: 13, cumulativeScore: 31, bankPileCount: 4, blurtzRemaining: 1, calledBlurtz: false },
        { username: "corvid", roundScore: 28, cumulativeScore: 40, bankPileCount: 9, blurtzRemaining: 0, calledBlurtz: true },
      ],
    },
  ],
};

describe("ScoreRaceChart", () => {
  it("draws one line per player", () => {
    const { container } = render(<ScoreRaceChart detail={detail} me="designpass" />);

    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("labels every line, so identity never rests on colour alone", () => {
    render(<ScoreRaceChart detail={detail} me="designpass" />);

    expect(screen.getByText(/designpass/)).toBeInTheDocument();
    expect(screen.getByText(/corvid/)).toBeInTheDocument();
  });

  it("keys the viewer's own line apart from the field", () => {
    const { container } = render(<ScoreRaceChart detail={detail} me="designpass" />);

    expect(container.querySelectorAll(".blurtz-race__line--me")).toHaveLength(1);
  });

  it("draws the target score as the finish line", () => {
    const { container } = render(<ScoreRaceChart detail={detail} me="designpass" />);

    expect(container.querySelector(".blurtz-race__target")).toBeInTheDocument();
  });

  it("describes the outcome for a screen reader", () => {
    render(<ScoreRaceChart detail={detail} me="designpass" />);

    expect(screen.getByRole("img")).toHaveAccessibleName(/^Cumulative score by round/i);
  });

  it("names the winner and the final scores in the description", () => {
    render(<ScoreRaceChart detail={detail} me="designpass" />);

    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";

    expect(name).toMatch(/designpass wins on 31/);
    expect(name).toMatch(/corvid 40/);
  });
});
