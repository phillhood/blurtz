import { Client } from "pg";
import { E2E_DATABASE_URL } from "./env";

/**
 * Direct access to the test database.
 *
 * Two things need it, and neither can be done through the API:
 *
 *  - **Making users.** `POST /api/auth/register` is rate limited to 5 per
 *    minute per IP (`auth.controller.ts`), and every browser in this suite
 *    shares 127.0.0.1. A suite that made its users through the front door
 *    would spend most of its life waiting out a 429 that has nothing to do
 *    with the code under test. The auth spec still drives the real register
 *    and login forms - that is what it is for. Every other spec starts from a
 *    user that already exists, which is what a returning player is.
 *
 *  - **Arranging states the UI cannot reach quickly.** A round only ends when
 *    somebody empties a blurtz pile, and playing 10 real cards through drag
 *    and drop to test the round-over screen would test dnd-kit, not rounds.
 *    See `emptyBlurtzPile`.
 *
 * Nothing here asserts. The database is the setup, never the subject: every
 * expectation in this suite is made against what the app shows or sends.
 */

/** `pg` does not understand Prisma's `?schema=` parameter; it is a no-op here. */
const CONNECTION_STRING = E2E_DATABASE_URL.replace(/\?.*$/, "");

export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/**
 * Everything this suite creates is named with this prefix so that teardown can
 * find it without knowing what any individual test did - and so that a run
 * that crashes half way through cleans up on the NEXT run rather than needing
 * manual surgery.
 */
export const E2E_PREFIX = "e2e_";

/**
 * A name no other test in this run (or the last one) is using.
 *
 * Capped at 20 characters and `[a-zA-Z0-9_]` only, because that is what
 * `RegisterDto` accepts - a longer one comes back 400 from the register route
 * and the failure looks nothing like a length problem. Game names allow 50, so
 * the tighter limit governs.
 */
let counter = 0;
export function uniqueName(kind: string): string {
  counter += 1;
  const stamp = Date.now().toString(36).slice(-6);
  const random = Math.random().toString(36).slice(2, 5);
  const short = kind.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
  return `${E2E_PREFIX}${short}${stamp}${random}${counter % 100}`;
}

/**
 * Delete every row this suite has ever created, in FK order.
 *
 * `players.user_id` is ON DELETE RESTRICT, so players must go before users;
 * games cascade to their players and round results, which covers the games an
 * e2e user hosted. The standalone player delete then catches an e2e user who
 * joined somebody else's game.
 */
export async function cleanupE2eData(): Promise<void> {
  await withDb(async (db) => {
    const like = `${E2E_PREFIX}%`;

    await db.query(
      `DELETE FROM games WHERE host_id IN (SELECT id FROM users WHERE username LIKE $1)`,
      [like]
    );
    await db.query(
      `DELETE FROM players WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
      [like]
    );
    await db.query(`DELETE FROM users WHERE username LIKE $1`, [like]);
  });
}
