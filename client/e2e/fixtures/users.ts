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
 * bcrypt at cost 12 takes ~200ms, and no test cares what any seeded user's
 * password hashes to - only that it is the hash of E2E_PASSWORD, so that a
 * seeded user can also log in through the real form if a test wants to.
 * Hashing it once per worker instead of once per user is the difference
 * between a suite that runs and one that idles in bcrypt.
 */
let passwordHash: Promise<string> | null = null;
function hashedPassword(): Promise<string> {
  passwordHash ??= bcrypt.hash(E2E_PASSWORD, 12);
  return passwordHash;
}

/**
 * A user that exists, without going through the register route.
 *
 * The token is minted here with the same payload `AuthService` signs
 * (`{ username, sub }`) and the same secret the server verifies with, so it is
 * indistinguishable from one the API issued - `JwtStrategy` and the socket
 * gateway's `handleConnection` both accept it. This is NOT a way around
 * authentication: the server still verifies every token it is handed, and the
 * auth spec covers the real issue-a-token path through the UI.
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
 * Put `user` in the browser exactly where a returning player's session lives:
 * the raw JWT under `token` (which `api.service.ts` and the socket connect path
 * read directly) and zustand's persisted `auth-storage` (which is what makes
 * `user` non-null on the first render, before the profile round-trip lands).
 *
 * Seeding both is deliberate. Token alone would leave `user` null until
 * `fetchUserProfile()` resolved, and `App.tsx` redirects a null user to /login
 * on sight - so every test would be racing a network call to reach its own
 * page.
 *
 * `addInitScript` rather than `page.evaluate` because this has to be in place
 * BEFORE the app's first line runs, not after a navigation has already
 * bounced.
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
