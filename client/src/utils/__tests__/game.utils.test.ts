import { describe, it, expect } from "vitest";
import { getGameStatusTitle, formatAge } from "../game.utils";

/**
 * The display helpers behind the one line of text that announces the state of
 * the game. They are pure, and every branch here is a thing a player reads.
 */
describe("getGameStatusTitle", () => {
  it("announces the winner by name, not by id", () => {
    // The point of the `winnerName` parameter: `gameState.winner` is a Player
    // id, and interpolating it raw greets the winner with a UUID.
    expect(getGameStatusTitle("finished", 2, 2, "ada")).toBe(
      "Game finished! - Winner: ada"
    );
    expect(getGameStatusTitle("finished", 2, 2, "ada")).not.toMatch(/Winner: $/);
  });

  it("says a finished game finished even when nobody won it", () => {
    // `readGameState` resolves `winner: winner?.id || null`, and a game where
    // everybody forfeited finishes with nobody. All three spellings of "no
    // winner" must avoid rendering the literal text "Winner: null".
    for (const noWinner of [null, undefined, ""]) {
      expect(getGameStatusTitle("finished", 2, 2, noWinner)).toBe(
        "Game finished!"
      );
    }
  });

  it("goes quiet once a waiting game is full, because the start button speaks", () => {
    expect(getGameStatusTitle("waiting", 2, 2)).toBe("");
    expect(getGameStatusTitle("waiting", 4, 4)).toBe("");
  });

  it("counts the players while a waiting game still has room", () => {
    expect(getGameStatusTitle("waiting", 1, 2)).toBe(
      "Waiting for players... (1/2)"
    );
  });

  it("counts against the game's own size, not a hardcoded 2", () => {
    // The 4-player cases are the point: a hardcoded denominator reports "(2/4)"
    // as "(2/2)", which reads as full while two seats are still open.
    expect(getGameStatusTitle("waiting", 1, 4)).toBe(
      "Waiting for players... (1/4)"
    );
    expect(getGameStatusTitle("waiting", 2, 4)).toBe(
      "Waiting for players... (2/4)"
    );
    expect(getGameStatusTitle("waiting", 2, 3)).toBe(
      "Waiting for players... (2/3)"
    );
  });

  it("distinguishes a round that ended from a game that ended", () => {
    // Two different screens hang off these: round_over is an interstitial the
    // players ready up on, finished is terminal. Collapsing them would strand
    // a lobby.
    expect(getGameStatusTitle("round_over", 2, 2)).toBe("Round over!");
    expect(getGameStatusTitle("playing", 2, 2)).toBe("Game in progress!");
    expect(getGameStatusTitle("round_over", 2, 2)).not.toBe(
      getGameStatusTitle("finished", 2, 2)
    );
  });

  it("does not invent text for a status it does not know", () => {
    expect(getGameStatusTitle("banana", 2, 2)).toBe("Unknown status");
  });
});

describe("formatAge", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("reads a fresh table as just now", () => {
    expect(formatAge(new Date("2026-08-31T11:59:30Z"), now)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(formatAge(new Date("2026-08-31T11:56:00Z"), now)).toBe("4m");
    expect(formatAge(new Date("2026-08-31T09:00:00Z"), now)).toBe("3h");
    expect(formatAge(new Date("2026-08-29T12:00:00Z"), now)).toBe("2d");
  });

  it("stops counting past a week", () => {
    expect(formatAge(new Date("2026-08-01T12:00:00Z"), now)).toBe("7d+");
  });

  it("never reports a table from the future as negative", () => {
    expect(formatAge(new Date("2026-08-31T12:05:00Z"), now)).toBe("just now");
  });

  it("accepts the ISO string the API actually sends, not just a Date", () => {
    expect(formatAge("2026-08-31T09:00:00Z", now)).toBe("3h");
  });
});
