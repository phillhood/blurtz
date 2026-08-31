import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchHistoryItem } from "@types";
import HistoryRow from "../components/HistoryRow";

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

describe("HistoryRow", () => {
  it("says what the game was", () => {
    render(<HistoryRow item={item()} me="designpass" onOpen={() => {}} />);

    expect(screen.getByText("Thursday regulars")).toBeInTheDocument();
    expect(screen.getByText("6 rounds")).toBeInTheDocument();
    expect(screen.getByText("First to 100")).toBeInTheDocument();
  });

  it("states the outcome in words, not colour", () => {
    render(<HistoryRow item={item()} me="designpass" onOpen={() => {}} />);

    expect(screen.getByText("Won")).toBeInTheDocument();
  });

  it("places a loss against the field", () => {
    render(
      <HistoryRow
        item={item({
          won: false,
          myScore: 71,
          players: [
            { username: "corvid", finalScore: 104 },
            { username: "bexley", finalScore: 83 },
            { username: "designpass", finalScore: 71 },
          ],
        })}
        me="designpass"
        onOpen={() => {}}
      />
    );

    expect(screen.getByText("3rd of 3")).toBeInTheDocument();
  });

  it("marks the viewer's own final score", () => {
    const { container } = render(
      <HistoryRow item={item()} me="designpass" onOpen={() => {}} />
    );

    const mine = container.querySelector(".blurtz-seatscore--me");

    expect(mine).toHaveTextContent("104");
  });

  it("opens the game when the row is activated", async () => {
    const onOpen = vi.fn();
    render(<HistoryRow item={item()} me="designpass" onOpen={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: /Thursday regulars/ }));

    expect(onOpen).toHaveBeenCalledWith("g1");
  });
});
