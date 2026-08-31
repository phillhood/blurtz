import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GameResultsDetail } from "@types";
import RoundTable from "../components/RoundTable";

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
        { username: "corvid", roundScore: -4, cumulativeScore: -4, bankPileCount: 1, blurtzRemaining: 5, calledBlurtz: false },
      ],
    },
  ],
};

describe("RoundTable", () => {
  it("heads a column per player and a row per round", () => {
    render(<RoundTable detail={detail} me="designpass" />);

    expect(screen.getByRole("columnheader", { name: "designpass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "corvid" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Round 1" })).toBeInTheDocument();
  });

  it("shows the round score and the running total together", () => {
    render(<RoundTable detail={detail} me="designpass" />);

    const row = screen.getByRole("row", { name: /Round 1/ });

    expect(within(row).getByText("+18")).toBeInTheDocument();
    expect(within(row).getByText("-4")).toBeInTheDocument();
  });

  it("says who called Blurtz rather than only marking it", () => {
    render(<RoundTable detail={detail} me="designpass" />);

    expect(screen.getByLabelText("designpass called Blurtz")).toBeInTheDocument();
  });

  it("keys the viewer's own column", () => {
    const { container } = render(<RoundTable detail={detail} me="designpass" />);

    expect(container.querySelectorAll(".blurtz-round__cell--me")).toHaveLength(1);
  });
});
