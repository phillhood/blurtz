import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { apiClient, ApiError } from "../api.service";
import { SOCKET_ERROR_CODES } from "@blurtz/shared";

// api.service.ts falls back to `http://${window.location.hostname}:3031`
// when VITE_API_URL isn't set, and jsdom defaults location to localhost.
const BASE_URL = "http://localhost:3031";

describe("ApiClient", () => {
  it("throws an ApiError carrying the real status on a 401", async () => {
    server.use(
      http.get(`${BASE_URL}/api/protected`, () =>
        HttpResponse.json({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }, { status: 401 })
      )
    );

    await expect(apiClient.get("/api/protected")).rejects.toMatchObject({
      status: 401,
    });

    let caught: unknown;
    try {
      await apiClient.get("/api/protected");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect((caught as ApiError).code).toBe("Unauthorized");
  });

  // A route that threads a typed reason answers with `code`; the two transports
  // then name the same failure the same way.
  it("prefers the body's `code` over Nest's default `error` slot", async () => {
    server.use(
      http.get(`${BASE_URL}/api/game/x/state`, () =>
        HttpResponse.json(
          { code: SOCKET_ERROR_CODES.NOT_A_PLAYER, message: "You are not a player in this game" },
          { status: 403 }
        )
      )
    );

    let caught: unknown;
    try {
      await apiClient.get("/api/game/x/state");
    } catch (err) {
      caught = err;
    }
    expect((caught as ApiError).status).toBe(403);
    expect((caught as ApiError).code).toBe(SOCKET_ERROR_CODES.NOT_A_PLAYER);
    expect((caught as ApiError).message).toBe("You are not a player in this game");
  });

  it("throws an ApiError carrying the real status on a 500", async () => {
    server.use(
      http.post(`${BASE_URL}/api/boom`, () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 })
      )
    );

    let caught: unknown;
    try {
      await apiClient.post("/api/boom", { some: "data" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });

  it("uses the response body's message as the error message when present", async () => {
    server.use(
      http.get(`${BASE_URL}/api/validation`, () =>
        HttpResponse.json(
          { statusCode: 400, message: "name must not be empty", error: "Bad Request" },
          { status: 400 }
        )
      )
    );

    await expect(apiClient.get("/api/validation")).rejects.toThrow(
      "name must not be empty"
    );
  });

  it("falls back gracefully when the error body is not JSON", async () => {
    server.use(
      http.get(`${BASE_URL}/api/plaintext`, () => new HttpResponse("oops", { status: 503 }))
    );

    let caught: unknown;
    try {
      await apiClient.get("/api/plaintext");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(503);
  });
});
