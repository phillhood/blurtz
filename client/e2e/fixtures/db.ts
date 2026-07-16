import { Client } from "pg";
import { E2E_DATABASE_URL } from "./env";

/**
 * Direct access to the test database, for the two things the API cannot give
 * this suite: users (`POST /api/auth/register` is 5/min per IP and every
 * browser here shares 127.0.0.1), and states the UI cannot reach quickly (see
 * `emptyBlurtzPile`).
 *
 * Nothing here asserts. The database is setup, never the subject.
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
 * Everything this suite creates carries this prefix, so teardown can find it
 * without knowing what any test did and a crashed run cleans up on the next one.
 */
export const E2E_PREFIX = "e2e_";

/**
 * A name no other test in this run (or the last one) is using.
 *
 * Capped at 20 chars and `[a-zA-Z0-9_]` only - what `RegisterDto` accepts. A
 * longer one 400s from the register route and the failure looks nothing like a
 * length problem. Game names allow 50, so the tighter limit governs.
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
 * Delete every row this suite created, in FK order: `players.user_id` is ON
 * DELETE RESTRICT, so players must go before users. Games cascade to their
 * players and round results (covering games an e2e user hosted); the standalone
 * player delete catches an e2e user who joined somebody else's game.
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
