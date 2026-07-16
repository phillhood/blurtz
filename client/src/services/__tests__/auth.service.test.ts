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

  it("returns the user on a 200", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/profile`, () =>
        HttpResponse.json({
          id: "user-1",
          username: "ada",
          gamesPlayed: 5,
          gamesWon: 2,
        })
      )
    );

    const user = await authService.getProfile();

    expect(user).toMatchObject({ id: "user-1", username: "ada" });
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

  it("returns the user and the token on success", async () => {
    let sent: unknown;
    server.use(
      http.post(`${BASE_URL}/api/auth/login`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          user: { id: "user-1", username: "ada" },
          token: "a.jwt.token",
        });
      })
    );

    const response = await authService.login({
      username: "ada",
      password: "password123",
    });

    expect(sent).toEqual({ username: "ada", password: "password123" });
    // The token is what authStore writes to localStorage and every later
    // request and the socket handshake read. Losing it here logs nobody in.
    expect(response.token).toBe("a.jwt.token");
    expect(response.user.username).toBe("ada");
  });

  it("keeps the server's own words on a 400", async () => {
    // Nest's ValidationPipe explains what was wrong with the input. That is
    // worth more to the user than a generic "Invalid request".
    server.use(
      http.post(`${BASE_URL}/api/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 400, message: "username should not be empty" },
          { status: 400 }
        )
      )
    );

    await expect(
      authService.login({ username: "", password: "x" })
    ).rejects.toThrow("username should not be empty");
  });

  it("does not blame the credentials for a 500", async () => {
    // A server that fell over has not judged the password. Saying "Invalid
    // credentials" here would send the user off to reset a working one.
    server.use(
      http.post(`${BASE_URL}/api/auth/login`, () =>
        HttpResponse.json({ statusCode: 500, message: "boom" }, { status: 500 })
      )
    );

    await expect(
      authService.login({ username: "ada", password: "password123" })
    ).rejects.toThrow("Server error. Please try again later.");
  });

  it("passes a throttled login through with the server's message", async () => {
    // 429 hits none of the specific branches, so it lands on the last throw.
    // The throttler's message is the only thing that tells the user to wait.
    server.use(
      http.post(`${BASE_URL}/api/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 429, message: "ThrottlerException: Too Many Requests" },
          { status: 429 }
        )
      )
    );

    await expect(
      authService.login({ username: "ada", password: "password123" })
    ).rejects.toThrow("ThrottlerException: Too Many Requests");
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

  it("returns the user and the token on success, so registering signs you in", async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/register`, () =>
        HttpResponse.json({
          user: { id: "user-2", username: "newbie" },
          token: "a.jwt.token",
        })
      )
    );

    const response = await authService.register({
      username: "newbie",
      password: "password123",
    });

    expect(response.token).toBe("a.jwt.token");
    expect(response.user.username).toBe("newbie");
  });

  it("keeps the server's own words on a 400", async () => {
    // The password rules live on the server. "Invalid request" would leave the
    // user guessing which rule they broke.
    server.use(
      http.post(`${BASE_URL}/api/auth/register`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: "password must be longer than or equal to 8 characters",
          },
          { status: 400 }
        )
      )
    );

    await expect(
      authService.register({ username: "newbie", password: "short" })
    ).rejects.toThrow("password must be longer than or equal to 8 characters");
  });

  it("does not claim the user exists when the server merely fell over", async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/register`, () =>
        HttpResponse.json({ statusCode: 503, message: "boom" }, { status: 503 })
      )
    );

    await expect(
      authService.register({ username: "newbie", password: "password123" })
    ).rejects.toThrow("Server error. Please try again later.");
  });
});
