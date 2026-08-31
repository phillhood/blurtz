import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Game } from "@types";
import TableRow from "../components/TableRow";

const game = (over: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Midnight rush",
  alias: "happy-blue-lemur",
  maxPlayers: 4,
  currentPlayers: 2,
  status: "waiting",
  targetScore: 25,
  currentRound: 1,
  hostUsername: "corvid",
  createdAt: new Date("2026-08-31T10:00:00Z"),
  ...over,
});

describe("TableRow", () => {
  it("shows what the player would be joining", () => {
    render(<TableRow game={game()} onJoin={() => {}} />);

    expect(screen.getByText("Midnight rush")).toBeInTheDocument();
    expect(screen.getByText("First to 25")).toBeInTheDocument();
    expect(screen.getByText("corvid")).toBeInTheDocument();
    expect(screen.getByText("2 seats open")).toBeInTheDocument();
  });

  it("joins by id when clicked", async () => {
    const onJoin = vi.fn();
    render(<TableRow game={game()} onJoin={onJoin} />);

    await userEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(onJoin).toHaveBeenCalledWith({ id: "g1" });
  });

  it("will not let anyone join a full table", () => {
    render(<TableRow game={game({ currentPlayers: 4 })} onJoin={() => {}} />);

    expect(screen.getByRole("button", { name: "Full" })).toBeDisabled();
  });

  it("will not let anyone join a finished table", () => {
    render(<TableRow game={game({ status: "finished" })} onJoin={() => {}} />);

    expect(screen.getByRole("button", { name: "Finished" })).toBeDisabled();
  });

  it("offers a rejoin for a table the player is already at, even a full one", () => {
    render(<TableRow game={game({ currentPlayers: 4 })} yours onJoin={() => {}} />);

    expect(screen.getByRole("button", { name: "Rejoin" })).toBeEnabled();
  });

  it("says where the player stands in a live table of theirs", () => {
    render(
      <TableRow
        game={game({ status: "playing", currentRound: 3, yourScore: 62, leaderScore: 71 })}
        yours
        onJoin={() => {}}
      />
    );

    expect(screen.getByText("Round 3")).toBeInTheDocument();
    expect(screen.getByText("You 62")).toBeInTheDocument();
    expect(screen.getByText("Leader 71")).toBeInTheDocument();
  });
});
