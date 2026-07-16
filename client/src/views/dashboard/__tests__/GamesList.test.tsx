import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GamesList from "../components/GamesList";
import { Game } from "@types";

const game = (id: string, name: string, over: Partial<Game> = {}): Game =>
  ({
    id,
    name,
    alias: `alias-${id}`,
    status: "waiting",
    maxPlayers: 4,
    currentPlayers: 1,
    createdAt: new Date(2024, 0, 3),
    ...over,
  }) as Game;

const setup = (props: Partial<React.ComponentProps<typeof GamesList>> = {}) => {
  const handlers = {
    onJoinGame: vi.fn(),
    onJoinGameByCode: vi.fn(),
    onCreateGame: vi.fn(),
    onRefreshGames: vi.fn(),
  };
  render(
    <GamesList
      activeGames={[]}
      availableGames={[]}
      loading={false}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, user: userEvent.setup() };
};

/** The section a card's heading owns, so the two lists can be told apart. */
const section = (heading: string) =>
  screen.getByRole("heading", { name: heading }).closest("div")!.parentElement!;

describe("GamesList", () => {
  it("lists the player's own games apart from the ones they could join", () => {
    setup({
      activeGames: [game("game-1", "My Game", { status: "playing" })],
      availableGames: [game("game-2", "Someone Else's Game")],
    });

    // The two lists mean different things - one is "get back to this", the
    // other is "join a stranger". Rendering a game under the wrong heading
    // tells the player they are in a game they are not.
    expect(
      within(section("My Games")).getByRole("heading", { name: "My Game" })
    ).toBeInTheDocument();
    expect(
      within(section("Available Games")).getByRole("heading", {
        name: "Someone Else's Game",
      })
    ).toBeInTheDocument();
  });

  it("offers a rejoin for an active game and a join for an available one", () => {
    setup({
      activeGames: [game("game-1", "My Game", { status: "playing" })],
      availableGames: [game("game-2", "Open Game")],
    });

    // GamesList passes `active` only to the first list; that flag is what
    // turns "Join Game" into "Rejoin" and keeps a full game clickable.
    expect(screen.getByRole("button", { name: "Rejoin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Game" })).toBeInTheDocument();
  });

  it("says so when there is nothing to join", () => {
    setup({ availableGames: [] });

    expect(
      screen.getByText("No games available. Create a new game to get started!")
    ).toBeInTheDocument();
  });

  it("shows a spinner instead of an empty-state lie while loading", () => {
    setup({ loading: true });

    // "No games available" during the first fetch would tell the player the
    // lobby is empty before anyone has looked.
    expect(screen.getAllByText("Loading games...").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("No games available. Create a new game to get started!")
    ).not.toBeInTheDocument();
  });

  it("disables every action while loading", () => {
    setup({ loading: true });

    expect(screen.getByRole("button", { name: "New Game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join by Code" })).toBeDisabled();
    expect(screen.getByTitle("Refresh Games")).toBeDisabled();
  });

  it("passes a join straight through with the game's id", async () => {
    const { onJoinGame, user } = setup({
      availableGames: [game("game-2", "Open Game")],
    });

    await user.click(screen.getByRole("button", { name: "Join Game" }));

    expect(onJoinGame).toHaveBeenCalledWith({ id: "game-2" });
  });

  it("opens the create and join-by-code flows", async () => {
    const { onCreateGame, onJoinGameByCode, user } = setup();

    await user.click(screen.getByRole("button", { name: "New Game" }));
    expect(onCreateGame).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Join by Code" }));
    expect(onJoinGameByCode).toHaveBeenCalled();
  });

  it("refreshes the lobby on demand", async () => {
    const { onRefreshGames, user } = setup();

    await user.click(screen.getByTitle("Refresh Games"));

    expect(onRefreshGames).toHaveBeenCalledTimes(1);
  });

  it("ignores a second refresh while the first is still spinning", async () => {
    // The guard exists to stop a held-down button firing a request per frame
    // at an API that rate limits 3/sec per IP.
    const { onRefreshGames, user } = setup();

    await user.click(screen.getByTitle("Refresh Games"));
    await user.click(screen.getByTitle("Refresh Games"));
    await user.click(screen.getByTitle("Refresh Games"));

    expect(onRefreshGames).toHaveBeenCalledTimes(1);
  });

  it("accepts a refresh again once the spin has finished", async () => {
    const { onRefreshGames, user } = setup();

    await user.click(screen.getByTitle("Refresh Games"));
    expect(onRefreshGames).toHaveBeenCalledTimes(1);

    // The guard clears itself on a 300ms timer. If it never came back down,
    // refresh would be a one-shot button for the life of the page - so wait it
    // out and prove a later click still lands.
    await waitFor(
      async () => {
        await user.click(screen.getByTitle("Refresh Games"));
        expect(onRefreshGames).toHaveBeenCalledTimes(2);
      },
      { timeout: 2_000 }
    );
  });

  it("does not break when there is no refresh handler", async () => {
    const user = userEvent.setup();
    render(
      <GamesList
        activeGames={[]}
        availableGames={[]}
        loading={false}
        onJoinGame={vi.fn()}
        onJoinGameByCode={vi.fn()}
      />
    );

    // `onRefreshGames` is optional. Without the guard this throws on click.
    await user.click(screen.getByTitle("Refresh Games"));

    expect(screen.getByRole("heading", { name: "Available Games" })).toBeInTheDocument();
  });
});
