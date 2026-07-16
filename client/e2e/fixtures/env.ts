import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as readDotenv } from "dotenv";

/**
 * The one place the e2e suite decides what it points at. Imported by BOTH
 * `playwright.config.ts` (to boot the servers) and the fixtures (to reach the
 * same database and sign tokens that server accepts) - two copies would be two
 * chances to test a different process than the one it started.
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
 * `processEnv: {}` matters: that file's `DATABASE_URL` is the DEV database, and
 * letting it leak into this process is how an e2e run ends up writing into the
 * database a human is using. Only `JWT_SECRET` is taken from it.
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
 * Taken from the real `.env` rather than invented: a fixture's token is only
 * accepted if it is signed with the secret the booted server verifies against.
 */
export const JWT_SECRET = required(
  "JWT_SECRET",
  process.env.JWT_SECRET ?? rootEnv.JWT_SECRET
);

/**
 * E2E runs against `blurtz_test`, NEVER the dev database: this suite creates
 * real users and games and would otherwise silt up the database the developer
 * is playing in. It is already migrated, and is where the other database-backed
 * suite (`game.concurrency.spec.ts`) lives.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://blurtz:blurtz@localhost:5442/blurtz_test?schema=public";

export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? "redis://localhost:6379";

/**
 * NOT negotiable: `client/src/services/socket.service.ts` hardcodes
 * `http://${window.location.hostname}:3031` and does not read `VITE_API_URL`
 * the way `api.service.ts` does. Boot the server elsewhere and REST works while
 * every socket connects to whatever else is on 3031 - or nothing.
 */
export const API_PORT = 3031;
export const API_URL = `http://localhost:${API_PORT}`;

/** Vite's dev port, and one of the two origins the gateway's CORS allows. */
export const CLIENT_PORT = 3000;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
