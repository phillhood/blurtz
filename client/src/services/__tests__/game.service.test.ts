import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { gameService } from "../game.service";
import { Game } from "@types";

// api.service.ts falls back to `http://${window.location.hostname}:3031` when
// VITE_API_URL isn't set, and jsdom defaults location to localhost.
const BASE_URL = "http://localhost:3031";

const game = (id: string, name: string): Game =>
  ({
    id,
    name,
    alias: "happy-blue-cat",
    status: "waiting",
    maxPlayers: 4,
    currentPlayers: 1,
    createdAt: new Date(),
  }) as Game;

/** The `{ success, data }` envelope every REST route in this app answers in. */
const ok = <T,>(data: T) => HttpResponse.json({ success: true, data });

describe("gameService", () => {
  beforeEach(() => {
    // These paths log the failure before throwing; the assertions are on the
    // throw, and the noise would drown the run.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAvailableGames", () => {
    it("reads the lobby listings off the route the server actually serves", async () => {
      // `/api/game/listings`, not the `/api/game/available` that the stale
      // API_ENDPOINTS constant claimed. MSW is set to error on an unhandled
      // request, so this test fails outright if the path drifts.
      server.use(
        http.get(`${BASE_URL}/api/game/listings`, () =>
          ok([game("game-1", "Test Game")])
        )
      );

      const games = await gameService.getAvailableGames();

      expect(games).toHaveLength(1);
      expect(games[0].name).toBe("Test Game");
    });

    it("unwraps the envelope rather than handing the envelope back", async () => {
      // The whole app treats the return value as `Game[]`. Returning the
      // `{ success, data }` wrapper would typecheck as `any` and blow up in
      // the list.
      server.use(
        http.get(`${BASE_URL}/api/game/listings`, () => ok([game("g", "N")]))
      );

      const games = await gameService.getAvailableGames();

      expect(Array.isArray(games)).toBe(true);
      expect(games).not.toHaveProperty("success");
    });

    it("throws when the envelope says the request failed", async () => {
      // A 200 with `success: false` is how this API reports failure - the
      // controllers catch and wrap rather than letting the status carry it. If
      // this returned instead of throwing, the lobby would render `undefined`.
      server.use(
        http.get(`${BASE_URL}/api/game/listings`, () =>
          HttpResponse.json({ success: false, error: "boom" })
        )
      );

      await expect(gameService.getAvailableGames()).rejects.toThrow();
    });

    it("throws when the envelope is successful but carries no data", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/listings`, () =>
          HttpResponse.json({ success: true })
        )
      );

      await expect(gameService.getAvailableGames()).rejects.toThrow();
    });
  });

  describe("getActiveGames", () => {
    it("reads the player's own games off /api/game/active", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/active`, () =>
          ok([game("game-9", "My Game")])
        )
      );

      const games = await gameService.getActiveGames();

      expect(games.map((g) => g.id)).toEqual(["game-9"]);
    });

    it("throws when the envelope says the request failed", async () => {
      server.use(
        http.get(`${BASE_URL}/api/game/active`, () =>
          HttpResponse.json({ success: false, error: "boom" })
        )
      );

      await expect(gameService.getActiveGames()).rejects.toThrow();
    });
  });

  describe("createGame", () => {
    it("posts the settings the player chose and returns the created game", async () => {
      let body: unknown;
      server.use(
        http.post(`${BASE_URL}/api/game`, async ({ request }) => {
          body = await request.json();
          return ok(game("game-new", "Phill's Game"));
        })
      );

      const created = await gameService.createGame({
        name: "Phill's Game",
        maxPlayers: 3,
        isPrivate: true,
      });

      // The settings have to survive the trip: a private 3-player game that
      // arrives as a public 2-player one is a bug nobody sees until someone
      // uninvited joins.
      expect(body).toEqual({
        name: "Phill's Game",
        maxPlayers: 3,
        isPrivate: true,
      });
      expect(created.id).toBe("game-new");
    });

    it("throws when the server refuses the create", async () => {
      // NOTE: what it throws is *not* asserted, deliberately. createGame wraps
      // its own body in try/catch and replaces whatever came back with a fixed
      // "Failed to create game. Please try again later." - so the server's real
      // reason ("name must not be empty") never reaches the user. That message
      // loss is reported as a bug; pinning the generic string here would freeze
      // it. What must hold either way is that a refused create throws rather
      // than resolving to a game that does not exist.
      server.use(
        http.post(`${BASE_URL}/api/game`, () =>
          HttpResponse.json(
            { success: false, error: "name must not be empty" },
            { status: 400 }
          )
        )
      );

      await expect(
        gameService.createGame({ name: "", maxPlayers: 2, isPrivate: false })
      ).rejects.toThrow();
    });
  });

  describe("joinGame", () => {
    it("joins by id through /api/game/joinById", async () => {
      // The two join routes are not interchangeable: joinByCode looks a game up
      // by its alias and would 404 on a uuid. Sending an id to the wrong one is
      // a join that silently never works.
      const hits: string[] = [];
      server.use(
        http.post(`${BASE_URL}/api/game/joinById`, () => {
          hits.push("byId");
          return ok(game("game-1", "Test Game"));
        }),
        http.post(`${BASE_URL}/api/game/joinByCode`, () => {
          hits.push("byCode");
          return ok(game("game-1", "Test Game"));
        })
      );

      const joined = await gameService.joinGame({ id: "game-1" });

      expect(hits).toEqual(["byId"]);
      expect(joined.id).toBe("game-1");
    });

    it("joins by alias through /api/game/joinByCode", async () => {
      const hits: string[] = [];
      server.use(
        http.post(`${BASE_URL}/api/game/joinById`, () => {
          hits.push("byId");
          return ok(game("game-2", "Test Game"));
        }),
        http.post(`${BASE_URL}/api/game/joinByCode`, () => {
          hits.push("byCode");
          return ok(game("game-2", "Test Game"));
        })
      );

      const joined = await gameService.joinGame({ alias: "happy-blue-cat" });

      expect(hits).toEqual(["byCode"]);
      expect(joined.id).toBe("game-2");
    });

    it("prefers the id when handed both", async () => {
      const hits: string[] = [];
      server.use(
        http.post(`${BASE_URL}/api/game/joinById`, () => {
          hits.push("byId");
          return ok(game("game-3", "Test Game"));
        }),
        http.post(`${BASE_URL}/api/game/joinByCode`, () => {
          hits.push("byCode");
          return ok(game("game-3", "Test Game"));
        })
      );

      await gameService.joinGame({ id: "game-3", alias: "happy-blue-cat" });

      expect(hits).toEqual(["byId"]);
    });

    it("throws when the game cannot be joined", async () => {
      // Same caveat as createGame: the thrown message is the generic one, which
      // is reported. That it throws at all is what keeps the caller from
      // navigating into a game it never joined.
      server.use(
        http.post(`${BASE_URL}/api/game/joinByCode`, () =>
          HttpResponse.json(
            { success: false, error: "Game is full" },
            { status: 400 }
          )
        )
      );

      await expect(gameService.joinGame({ alias: "full-game" })).rejects.toThrow();
    });
  });

  describe("leaveGame", () => {
    it("posts to the leave route for the game in question", async () => {
      let hit: string | undefined;
      server.use(
        http.post(`${BASE_URL}/api/game/:gameId/leave`, ({ params }) => {
          hit = params.gameId as string;
          return HttpResponse.json({ success: true });
        })
      );

      await gameService.leaveGame("game-7");

      expect(hit).toBe("game-7");
    });
  });
});
