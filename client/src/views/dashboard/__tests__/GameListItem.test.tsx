import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameListItem from "../components/GameListItem";
import { Game } from "@types";

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: "game-1",
    name: "Friday Night",
    alias: "happy-blue-cat",
    status: "waiting",
    maxPlayers: 4,
    currentPlayers: 1,
    createdAt: new Date(2024, 0, 3, 14, 30),
    ...over,
  }) as Game;

/**
 * One row of the lobby. The button on it is the only way into a game from the
 * list, so what it says and whether it works is the whole component.
 */
describe("GameListItem", () => {
  it("joins by id when clicked", async () => {
    const onJoin = vi.fn();
    render(<GameListItem game={game()} onJoin={onJoin} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Join Game" }));

    // `id`, not `alias` - a listing has the real id, and this routes to
    // /api/game/joinById.
    expect(onJoin).toHaveBeenCalledWith({ id: "game-1" });
  });

  it("shows the game's name, its player count and when it was made", () => {
    render(<GameListItem game={game({ currentPlayers: 2 })} onJoin={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Friday Night" })).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText(/January 3rd, 2024/)).toBeInTheDocument();
  });

  it("will not let anyone join a full game", async () => {
    const onJoin = vi.fn();
    render(
      <GameListItem
        game={game({ currentPlayers: 4, maxPlayers: 4 })}
        onJoin={onJoin}
      />
    );

    const button = screen.getByRole("button", { name: "Full" });
    expect(button).toBeDisabled();

    await userEvent.setup().click(button);
    // The server would refuse this anyway; the point is not making the player
    // find that out by clicking.
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("will not let anyone join a finished game", async () => {
    const onJoin = vi.fn();
    render(
      <GameListItem game={game({ status: "finished", currentPlayers: 1 })} onJoin={onJoin} />
    );

    expect(screen.getByRole("button", { name: "Finished" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Finished" }));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("offers a rejoin for a game the player is already in, even a full one", async () => {
    // `active` means this is the player's own game from /api/game/active. They
    // hold a seat in it, so "Full" would lock them out of their own game.
    const onJoin = vi.fn();
    render(
      <GameListItem
        game={game({ status: "playing", currentPlayers: 4, maxPlayers: 4 })}
        active
        onJoin={onJoin}
      />
    );

    const button = screen.getByRole("button", { name: "Rejoin" });
    expect(button).toBeEnabled();

    await userEvent.setup().click(button);
    expect(onJoin).toHaveBeenCalledWith({ id: "game-1" });
  });

  it("distinguishes a game waiting for people from one waiting to start", () => {
    const { unmount } = render(
      <GameListItem game={game({ currentPlayers: 1, maxPlayers: 4 })} onJoin={vi.fn()} />
    );
    expect(screen.getByText("Waiting for more players")).toBeInTheDocument();
    unmount();

    render(
      <GameListItem game={game({ currentPlayers: 4, maxPlayers: 4 })} onJoin={vi.fn()} />
    );
    // Full but not started: the host has a start button, and this is the only
    // thing telling everyone else what they are waiting on.
    expect(screen.getByText("Waiting to start")).toBeInTheDocument();
  });

  it("labels each status a game can be in", () => {
    const cases: [Game["status"], string][] = [
      ["starting", "Starting"],
      ["playing", "Playing"],
      ["paused", "Paused"],
      ["finished", "Finished"],
    ] as [Game["status"], string][];

    for (const [status, label] of cases) {
      const { unmount } = render(
        <GameListItem game={game({ status })} onJoin={vi.fn()} />
      );
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
