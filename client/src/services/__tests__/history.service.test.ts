import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { historyService } from "../history.service";
import { GameResultsDetail, MatchHistoryItem } from "@types";

// api.service.ts falls back to `http://${window.location.hostname}:3031` when
// VITE_API_URL isn't set, and jsdom defaults location to localhost.
const BASE_URL = "http://localhost:3031";

const item = (gameId: string, name: string): MatchHistoryItem => ({
  gameId,
  name,
  playedAt: "2026-08-31T10:00:00Z",
  targetScore: 100,
  rounds: 6,
  players: [
    { username: "designpass", finalScore: 104 },
    { username: "corvid", finalScore: 97 },
  ],
  myScore: 104,
  won: true,
});

const detail = (gameId: string): GameResultsDetail => ({
  gameId,
  name: "Thursday regulars",
  targetScore: 100,
  winnerUsername: "designpass",
  rounds: [],
});

/** The `{ success, data }` envelope every REST route in this app answers in. */
const ok = <T,>(data: T) => HttpResponse.json({ success: true, data });

describe("historyService", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getHistory", () => {
    it("reads the finished games off /api/game/history", async () => {
      // MSW is set to error on an unhandled request, so this test fails
      // outright if the path drifts.
      server.use(
        http.get(`${BASE_URL}/api/game/history`, () =>
          ok([item("g1", "Thursday regulars")])
        )
      );

      const history = await historyService.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].name).toBe("Thursday regulars");
    });

    it("unwraps the envelope rather than handing the envelope back", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/history`, () => ok([item("g1", "N")]))
      );

      const history = await historyService.getHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history).not.toHaveProperty("success");
    });

    it("raises the failure rather than returning an empty list", async () => {
      // An empty list means "you have played nothing", which is a different
      // screen from "we could not ask". Returning [] here would show the wrong
      // one.
      server.use(
        http.get(`${BASE_URL}/api/game/history`, () =>
          HttpResponse.json({ success: false, error: "boom" })
        )
      );

      await expect(historyService.getHistory()).rejects.toThrow();
    });

    it("throws when the envelope is successful but carries no data", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/history`, () =>
          HttpResponse.json({ success: true })
        )
      );

      await expect(historyService.getHistory()).rejects.toThrow();
    });
  });

  describe("getResults", () => {
    it("asks for one game's results by id", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/g1/results`, () => ok(detail("g1")))
      );

      const results = await historyService.getResults("g1");

      expect(results.gameId).toBe("g1");
    });

    it("surfaces the membership refusal the server actually sent", async () => {
      // `:id/results` answers 403 for a missing game and a non-member alike, so
      // the caller must never be told the game does not exist.
      server.use(
        http.get(`${BASE_URL}/api/game/g1/results`, () =>
          HttpResponse.json(
            {
              statusCode: 403,
              message: "You are not a player in this game",
              error: "Forbidden",
            },
            { status: 403 }
          )
        )
      );

      await expect(historyService.getResults("g1")).rejects.toThrow(
        "You are not a player in this game"
      );
    });

    it("does not bury a 500 under the server's internals", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/g1/results`, () =>
          HttpResponse.json(
            { statusCode: 500, message: "ECONNREFUSED prisma pool" },
            { status: 500 }
          )
        )
      );

      await expect(historyService.getResults("g1")).rejects.toThrow(
        "Server error. Please try again later."
      );
    });

    it("throws when the envelope says the request failed", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/g1/results`, () =>
          HttpResponse.json({ success: false, error: "boom" })
        )
      );

      await expect(historyService.getResults("g1")).rejects.toThrow();
    });
  });
});
