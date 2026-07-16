import type { RequestHandler } from "msw";

/**
 * The default MSW handler set, deliberately empty.
 *
 * `test/setup.ts` starts this server with `onUnhandledRequest: "error"`, which
 * makes any request a test did not explicitly mock a hard failure. That is the
 * useful property: it is what makes a path drift - `/api/game/listings` quietly
 * becoming something else - fail the suite instead of passing against a mock
 * nobody looked at. Every test that needs the network declares exactly what it
 * needs with `server.use(...)`, and reads better for saying so out loud.
 *
 * This file used to hold a default set that pointed at `http://localhost:3001`
 * and routes the server has never served (`/game/available`, `/game/join`, and
 * the rest without the `/api` prefix). The app calls `:3031/api/*`, so not one
 * of them was ever hit - which is exactly why they could rot unnoticed. They
 * are not corrected here, because a correct default set would undo the
 * tripwire: a test that forgot its `server.use` would silently match a default
 * instead of erroring, and the next drift would go unnoticed the same way.
 *
 * Keep this empty. Mock what you need, where you need it.
 */
export const handlers: RequestHandler[] = [];
