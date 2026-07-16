import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import {
  API_PORT,
  API_URL,
  CLIENT_URL,
  E2E_DATABASE_URL,
  E2E_REDIS_URL,
  JWT_SECRET,
  REPO_ROOT,
} from "./e2e/fixtures/env";

export default defineConfig({
  testDir: "./e2e",

  /**
   * Sequential, on purpose.
   *
   * Every browser context in this suite comes from 127.0.0.1, and the API rate
   * limits 3 requests/second PER IP globally (`ThrottlerModule` in
   * `app.module.ts`). A dashboard load is three requests on its own - profile,
   * listings, active - so parallel workers do not test anything except the
   * throttler, and manufacture 429s that have nothing to do with the code under
   * test. The suite is small enough that sequential costs ~a minute, and the
   * determinism is worth more than the minute.
   */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  /** Wipe out anything left behind by this run, or by one that crashed. */
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: CLIENT_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /**
   * Chromium only.
   *
   * What this suite tests is a server-authoritative game: socket round trips,
   * redaction on the wire, two players racing each other. None of that is
   * browser-specific, and running it three times over would triple the load on
   * a single rate-limited server to re-test Vite's output in another engine.
   * The firefox/webkit/mobile projects that used to be listed here never ran a
   * green suite - there was no API for them to talk to - so nothing is lost by
   * being honest about the coverage.
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      /**
       * The API, on 3031 against the TEST database.
       *
       * `reuseExistingServer: false` even locally, and that is the whole point:
       * if `make up`'s container is on 3031, reusing it would silently run the
       * whole suite against the DEV database with none of these env vars. A
       * loud "port is already used" is the correct outcome - stop the
       * container (`docker compose stop server client`) and run again.
       */
      command: "npm run start:dev --workspace server",
      cwd: REPO_ROOT,
      url: `${API_URL}/api/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        REDIS_URL: E2E_REDIS_URL,
        JWT_SECRET,
        API_PORT: String(API_PORT),
        /**
         * NOT "test", even though this is the test run.
         *
         * `main.ts` reads `enableCors({ origin: NODE_ENV === "development" })`,
         * so any other value turns CORS OFF and the browser blocks every
         * request from :3000 to :3031. The env schema accepts "test" happily;
         * the app then quietly refuses to serve a browser.
         */
        NODE_ENV: "development",
        LOG_LEVEL: "warn",
      },
    },
    {
      /**
       * Vite. Reuse is fine here (unlike the API): a dev server already on
       * :3000 is serving the same source from the same working tree, and it
       * holds no state of its own.
       */
      command: "npm run dev",
      cwd: path.join(REPO_ROOT, "client"),
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
