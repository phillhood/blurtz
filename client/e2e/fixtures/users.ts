import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./env";
import { uniqueName, withDb } from "./db";

export interface TestUser {
  id: string;
  username: string;
  password: string;
  /** A token the booted server will accept - signed with ITS secret. */
  token: string;
}

/** The password every seeded user has. Long enough for `RegisterDto`. */
export const E2E_PASSWORD = "e2ePassword123!";

/**
 * bcrypt at cost 12 takes ~200ms. Hashed once per worker rather than per user;
 * it must stay the hash of E2E_PASSWORD so a seeded user can also log in
 * through the real form.
 */
let passwordHash: Promise<string> | null = null;
function hashedPassword(): Promise<string> {
  passwordHash ??= bcrypt.hash(E2E_PASSWORD, 12);
  return passwordHash;
}

/**
 * A user that exists, without going through the register route.
 *
 * The token is minted with the payload `AuthService` signs (`{ username, sub }`)
 * and the secret the server verifies with, so `JwtStrategy` and the gateway's
 * `handleConnection` both accept it. Not a way around authentication - the
 * server still verifies every token, and the auth spec covers the real path.
 */
export async function createUser(kind = "user"): Promise<TestUser> {
  const id = randomUUID();
  const username = uniqueName(kind);

  await withDb(async (db) => {
    await db.query(
      `INSERT INTO users (id, username, password, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [id, username, await hashedPassword()]
    );
  });

  return {
    id,
    username,
    password: E2E_PASSWORD,
    token: jwt.sign({ username, sub: id }, JWT_SECRET, { expiresIn: "7d" }),
  };
}

/**
 * Put `user` where a returning player's session lives: the raw JWT under
 * `token` (read by `api.service.ts` and the socket connect path) and zustand's
 * persisted `auth-storage`.
 *
 * Both are needed. Token alone leaves `user` null until `fetchUserProfile()`
 * resolves, and `App.tsx` redirects a null user to /login on sight.
 * `addInitScript`, not `page.evaluate`: this must be in place before the app's
 * first line runs.
 */
export async function authenticate(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(
    ({ token, storedUser }) => {
      localStorage.setItem("token", token);
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user: storedUser }, version: 0 })
      );
    },
    {
      token: user.token,
      storedUser: {
        id: user.id,
        username: user.username,
        gamesPlayed: 0,
        gamesWon: 0,
        createdAt: new Date().toISOString(),
      },
    }
  );
}
