import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { authService } from "../auth.service";
import { ApiError } from "../api.service";

const BASE_URL = "http://localhost:3031";

describe("AuthService.getProfile", () => {
  it("propagates an ApiError with status 401 on an expired/invalid token, instead of a flattened string", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/profile`, () =>
        HttpResponse.json({ statusCode: 401, message: "Unauthorized" }, { status: 401 })
      )
    );

    let caught: unknown;
    try {
      await authService.getProfile();
    } catch (err) {
      caught = err;
    }

    // This is the thing authStore.fetchUserProfile actually branches on -
    // it must be an ApiError with a real status, not `new Error("Failed to fetch profile")`.
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
  });

  it("surfaces a plain 'User not found' message on a 404", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/profile`, () =>
        HttpResponse.json({ statusCode: 404, message: "User not found" }, { status: 404 })
      )
    );

    await expect(authService.getProfile()).rejects.toThrow("User not found");
  });

  it("returns a generic server error message on a 500", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/profile`, () =>
        HttpResponse.json({ statusCode: 500, message: "boom" }, { status: 500 })
      )
    );

    await expect(authService.getProfile()).rejects.toThrow(
      "Server error. Please try again later."
    );
  });
});

describe("AuthService.login", () => {
  it("maps a 401 to 'Invalid credentials'", async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/login`, () =>
        HttpResponse.json({ statusCode: 401, message: "Invalid credentials" }, { status: 401 })
      )
    );

    await expect(
      authService.login({ username: "u", password: "wrong" })
    ).rejects.toThrow("Invalid credentials");
  });
});

describe("AuthService.register", () => {
  it("maps a 409 to 'User already exists'", async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/register`, () =>
        HttpResponse.json({ statusCode: 409, message: "Username already exists" }, { status: 409 })
      )
    );

    await expect(
      authService.register({ username: "taken", password: "password123" })
    ).rejects.toThrow("User already exists");
  });
});
