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
        targetScore: 25,
      });

      // The settings have to survive the trip: a private 3-player game that
      // arrives as a public 2-player one is a bug nobody sees until someone
      // uninvited joins.
      expect(body).toEqual({
        name: "Phill's Game",
        maxPlayers: 3,
        isPrivate: true,
        targetScore: 25,
      });
      expect(created.id).toBe("game-new");
    });

    it("omits the target score entirely when none was chosen", async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${BASE_URL}/api/game`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return ok(game("game-new", "Phill's Game"));
        })
      );

      await gameService.createGame({
        name: "Phill's Game",
        maxPlayers: 2,
        isPrivate: false,
      });

      // An explicit null would be refused by CreateGameDto; the field has to be
      // absent for the server's default to apply.
      expect(body).not.toHaveProperty("targetScore");
    });

    it("tells the player what the server actually objected to", async () => {
      // Shaped as a real Nest ValidationPipe body: a real status, and `message`
      // as an array.
      server.use(
        http.post(`${BASE_URL}/api/game`, () =>
          HttpResponse.json(
            {
              statusCode: 400,
              message: ["name must not be empty"],
              error: "Bad Request",
            },
            { status: 400 }
          )
        )
      );

      await expect(
        gameService.createGame({ name: "", maxPlayers: 2, isPrivate: false })
      ).rejects.toThrow("name must not be empty");
    });

    it("does not bury a 500 under the server's internals", async () => {
      // The other half of the rule: a 5xx is the server falling over, not the
      // player getting it wrong, and its message is not the player's to read.
      server.use(
        http.post(`${BASE_URL}/api/game`, () =>
          HttpResponse.json(
            { statusCode: 500, message: "ECONNREFUSED prisma pool" },
            { status: 500 }
          )
        )
      );

      await expect(
        gameService.createGame({ name: "OK", maxPlayers: 2, isPrivate: false })
      ).rejects.toThrow("Server error. Please try again later.");
    });

    it("falls back to a generic message when the envelope refuses without a reason", async () => {
      server.use(
        http.post(`${BASE_URL}/api/game`, () =>
          HttpResponse.json({ success: false })
        )
      );

      await expect(
        gameService.createGame({ name: "OK", maxPlayers: 2, isPrivate: false })
      ).rejects.toThrow("Failed to create game. Please try again later.");
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

    it("tells the player why the game could not be joined", async () => {
      // "Game is full" and "Game with alias x not found" are different things
      // for the player to do next; a generic fallback is neither.
      server.use(
        http.post(`${BASE_URL}/api/game/joinByCode`, () =>
          HttpResponse.json(
            { statusCode: 400, message: "Game is full", error: "Bad Request" },
            { status: 400 }
          )
        )
      );

      await expect(gameService.joinGame({ alias: "full-game" })).rejects.toThrow(
        "Game is full"
      );
    });

    it("surfaces a 404 from the invite-code lookup as the server phrased it", async () => {
      server.use(
        http.post(`${BASE_URL}/api/game/joinByCode`, () =>
          HttpResponse.json(
            {
              statusCode: 404,
              message: "Game with alias nope not found",
              error: "Not Found",
            },
            { status: 404 }
          )
        )
      );

      await expect(gameService.joinGame({ alias: "nope" })).rejects.toThrow(
        "Game with alias nope not found"
      );
    });

    it("refuses a join with neither an id nor a code, without issuing a request", async () => {
      // Unreachable from the current UI, but the alternative to refusing is a
      // POST to the API root: a request that addresses no route and that the
      // caller cannot read as anything.
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await expect(gameService.joinGame({})).rejects.toThrow(
        "Cannot join a game without an id or an invite code."
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

});
