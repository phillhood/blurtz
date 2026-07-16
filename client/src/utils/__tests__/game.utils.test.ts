import { describe, it, expect } from "vitest";
import { getGameStatusTitle, getStatusColor, formatDate } from "../game.utils";

/**
 * The display helpers behind the one line of text that announces the state of
 * the game. They are pure, and every branch here is a thing a player reads.
 */
describe("getGameStatusTitle", () => {
  it("announces the winner by name, not by id", () => {
    // The point of the `winnerName` parameter. `gameState.winner` is a Player
    // id and this used to interpolate it raw, so the screen that announces the
    // whole point of the game greeted the winner with a UUID.
    expect(getGameStatusTitle("finished", 2, 2, "ada")).toBe(
      "Game finished! - Winner: ada"
    );
    expect(getGameStatusTitle("finished", 2, 2, "ada")).not.toMatch(/Winner: $/);
  });

  it("says a finished game finished even when nobody won it", () => {
    // `readGameState` resolves `winner: winner?.id || null`, and a game where
    // everybody forfeited finishes with nobody. All three of these used to
    // render the literal text "Winner: null".
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
    // The denominator used to be the literal `2` regardless of maxPlayers, so
    // a 4-player game waiting for people reported "(1/2)" and - the case that
    // proves it - sat at "(2/2)" while still waiting for two more, which reads
    // as full. maxPlayers was accepted and used only for the full check.
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

describe("getStatusColor", () => {
  it("gives a running game a colour of its own", () => {
    // The only status the player can act in has to be distinguishable from the
    // three that they cannot.
    const playing = getStatusColor("playing");
    expect(playing).toBe("#10b981");
    expect(playing).not.toBe(getStatusColor("waiting"));
    expect(playing).not.toBe(getStatusColor("finished"));
    expect(playing).not.toBe(getStatusColor("round_over"));
  });

  it("colours round_over like waiting, because both are a game paused on its players", () => {
    expect(getStatusColor("round_over")).toBe(getStatusColor("waiting"));
  });

  it("falls back to the finished grey rather than to undefined", () => {
    // Callers drop this straight into a `color:` style. A missing return would
    // not throw, it would silently render the browser default.
    expect(getStatusColor("banana")).toBe("#6b7280");
  });
});

describe("formatDate", () => {
  it("gives the day an ordinal suffix", () => {
    expect(formatDate(new Date(2024, 0, 1, 9, 5))).toContain("January 1st, 2024");
    expect(formatDate(new Date(2024, 0, 2, 9, 5))).toContain("January 2nd, 2024");
    expect(formatDate(new Date(2024, 0, 3, 9, 5))).toContain("January 3rd, 2024");
    expect(formatDate(new Date(2024, 0, 4, 9, 5))).toContain("January 4th, 2024");
  });

  it("says 11th, 12th and 13th rather than 11st, 12nd and 13rd", () => {
    // The reason `getOrdinalSuffix` special-cases the teens before it looks at
    // day % 10. Without that branch these read as 11st/12nd/13rd.
    expect(formatDate(new Date(2024, 0, 11))).toContain("January 11th");
    expect(formatDate(new Date(2024, 0, 12))).toContain("January 12th");
    expect(formatDate(new Date(2024, 0, 13))).toContain("January 13th");
  });

  it("suffixes 21st and 22nd off the last digit, not the teens rule", () => {
    expect(formatDate(new Date(2024, 0, 21))).toContain("January 21st");
    expect(formatDate(new Date(2024, 0, 22))).toContain("January 22nd");
    expect(formatDate(new Date(2024, 0, 23))).toContain("January 23rd");
  });

  it("accepts the ISO string the API actually sends, not just a Date", () => {
    // `game.createdAt` arrives over the wire as a string; GameListItem hands it
    // straight to this.
    const iso = new Date(2024, 5, 3, 14, 30).toISOString();
    expect(formatDate(iso)).toContain("June 3rd, 2024");
  });

  it("includes a 12-hour time", () => {
    expect(formatDate(new Date(2024, 0, 1, 14, 30))).toMatch(/2:30\s?PM/);
    expect(formatDate(new Date(2024, 0, 1, 9, 5))).toMatch(/9:05\s?AM/);
  });
});
