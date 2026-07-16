import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as readDotenv } from "dotenv";

/**
 * The one place the e2e suite decides what it points at.
 *
 * Imported by BOTH `playwright.config.ts` (to boot the servers) and the test
 * fixtures (to reach the same database and sign tokens the same server will
 * accept). Two copies of this would be two chances for the suite to test a
 * different process than the one it started.
 */

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

/**
 * The root `.env`, read WITHOUT touching `process.env`.
 *
 * `processEnv: {}` matters: that file's `DATABASE_URL` is the DEV database,
 * and letting it leak into this process is exactly how an e2e run ends up
 * writing users into the database a human is using. The only value taken from
 * it is `JWT_SECRET`, which has to match the server's or every minted token is
 * rejected.
 */
const rootEnv =
  readDotenv({ path: path.join(REPO_ROOT, ".env"), processEnv: {} }).parsed ??
  {};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `e2e: ${name} is not set and is not in ${path.join(REPO_ROOT, ".env")}. ` +
        `Copy .env.example to .env (see CLAUDE.md).`
    );
  }
  return value;
}

/**
 * The secret the e2e server signs with, and therefore the secret this suite
 * must mint tokens with. Taken from the real `.env` rather than invented, so
 * the token a fixture makes is one the booted server actually accepts.
 */
export const JWT_SECRET = required(
  "JWT_SECRET",
  process.env.JWT_SECRET ?? rootEnv.JWT_SECRET
);

/**
 * E2E runs against `blurtz_test`, NEVER the dev database.
 *
 * The suite registers real users and creates real games; pointed at `blurtz`
 * it would silt up the database the developer is playing in, and "why is there
 * a game called Test Game 1763..." is a bad way to spend an afternoon. The
 * test database is already migrated and is already where the one other
 * database-backed suite (`game.concurrency.spec.ts`) lives.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://blurtz:blurtz@localhost:5442/blurtz_test?schema=public";

export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? "redis://localhost:6379";

/**
 * The API port is 3031 and is NOT negotiable, because
 * `client/src/services/socket.service.ts` hardcodes
 * `http://${window.location.hostname}:3031` for the Socket.IO connection. It
 * does not read `VITE_API_URL` the way `api.service.ts` does. Boot the server
 * anywhere else and REST works while every socket in the app connects to
 * whatever else happens to be on 3031 - or nothing.
 */
export const API_PORT = 3031;
export const API_URL = `http://localhost:${API_PORT}`;

/** Vite's dev port, and one of the two origins the gateway's CORS allows. */
export const CLIENT_PORT = 3000;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
