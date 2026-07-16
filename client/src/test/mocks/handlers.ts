import type { RequestHandler } from "msw";

/**
 * The default MSW handler set, deliberately empty.
 *
 * `test/setup.ts` starts the server with `onUnhandledRequest: "error"`, so any
 * request a test did not explicitly mock is a hard failure - which is what makes
 * a path drift fail the suite rather than pass against a mock nobody looked at.
 *
 * Keep this empty: a default set here would undo that tripwire, letting a test
 * that forgot its `server.use` silently match a default instead of erroring.
 * Mock what you need, where you need it.
 */
export const handlers: RequestHandler[] = [];
