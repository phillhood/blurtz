import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { uniqueName, withDb } from "./db";
import { authenticate, createUser, type TestUser } from "./users";

export interface CreatedGame {
  id: string;
  name: string;
  alias: string;
}

/**
 * Wait for the game socket to have finished connecting.
 *
 * A correctness requirement, not politeness: `gameStore.createAndJoinGame`
 * bails when `!socketService.connected`, and `Dashboard.handleCreateGame` only
 * navigates `if (game?.id)`. Clicking Create Game before the socket is up
 * therefore does nothing at all, silently - the Dashboard never renders
 * gameStore's error.
 *
 * Resolves on the socket.io CONNECT ack (engine.io `40`), the frame that sets
 * `socketService.connected`, rather than on a guess about timing.
 */
export function gameSocketConnected(page: Page): Promise<void> {
  return new Promise<void>((resolve) => {
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        if (typeof frame.payload === "string" && frame.payload.startsWith("40")) {
          resolve();
        }
      });
    });
  });
}

/**
 * Create a game through the real dashboard and read back what the app says it
 * made - the id from the URL, the invite code from the header. Nothing is read
 * from the database: this is a flow, not a fixture.
 */
export async function createGameViaUi(
  page: Page,
  options: {
    isPrivate?: boolean;
    name?: string;
    /** Seats to open. The modal's stepper starts at 2 and clamps to 2-4. */
    maxPlayers?: number;
    targetScore?: number;
  } = {}
): Promise<CreatedGame> {
  const name = options.name ?? uniqueName("game");

  const connected = gameSocketConnected(page);
  await page.goto("/dashboard");
  await connected;

  await page.getByRole("button", { name: "New Game" }).click();

  await expect(page.getByRole("heading", { name: "Create New Game" })).toBeVisible();
  await page.getByPlaceholder("Enter game name...").fill(name);

  if (options.maxPlayers !== undefined) {
    await setMaxPlayersViaUi(page, options.maxPlayers);
  }

  if (options.targetScore !== undefined) {
    await setTargetScoreViaUi(page, options.targetScore);
  }

  if (options.isPrivate) {
    // Located by role alone because it is the only checkbox in the modal: it
    // has no accessible name to match on.
    await page.getByRole("checkbox").check();
  }

  // Watch the create call itself: the Dashboard navigates `if (game?.id)` and
  // says nothing otherwise, so a 429 and a request that was never made both
  // surface uselessly as "expected /game/<id>, got /dashboard".
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Create Game" }).click();
  const response = await created;
  expect(response.status(), `POST /api/game: ${await response.text()}`).toBe(201);

  await expect(page).toHaveURL(/\/game\/[0-9a-f-]{36}$/);
  const id = page.url().split("/game/")[1];

  // The header renders the server-generated code, so waiting for it to be
  // non-empty waits for the socket to have delivered game state. The `expect`
  // does that waiting; reading `innerText()` straight out races the first
  // render, which paints the header before any state arrives.
  await expect(gameCode(page)).not.toBeEmpty();
  const alias = await gameCode(page).innerText();

  return { id, name, alias };
}

/**
 * Walk the Game Size stepper up from its default of 2. The readout is the only
 * thing that reports where it landed, so it is what gets waited on.
 */
async function setMaxPlayersViaUi(page: Page, maxPlayers: number): Promise<void> {
  for (let seats = 2; seats < maxPlayers; seats++) {
    await page.getByRole("button", { name: "+", exact: true }).click();
  }
  await expect(page.getByText(`${maxPlayers} players`)).toBeVisible();
}

/** The scores the Target Score select offers without typing one in. */
const TARGET_SCORE_PRESETS = [25, 100, 150];

async function setTargetScoreViaUi(page: Page, targetScore: number): Promise<void> {
  const select = page.getByLabel("Target Score", { exact: true });

  if (TARGET_SCORE_PRESETS.includes(targetScore)) {
    await select.selectOption(String(targetScore));
    return;
  }

  await select.selectOption("custom");
  await page.getByLabel("Custom Target Score").fill(String(targetScore));
}

/** The invite code, as shown in the game header. */
export function gameCode(page: Page) {
  return page.locator("span[style*='monospace']").first();
}

export async function joinByCodeViaUi(page: Page, alias: string): Promise<void> {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Join by Code" }).click();
  await expect(page.getByRole("heading", { name: "Join Game by Code" })).toBeVisible();
  await page.getByPlaceholder("e.g., happy-blue-lemur").fill(alias);
  // Scoped to the dialog's form: every game in the listings behind it has a
  // "Join Game" button too, so an unscoped locator matches a dozen things and
  // clicks whichever the DOM happened to put first.
  await joinDialog(page).getByRole("button", { name: "Join Game" }).click();
}

/** The join-by-code dialog, identified by the only input it contains. */
export function joinDialog(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByPlaceholder("e.g., happy-blue-lemur") });
}

/**
 * Ready up, and wait for the SERVER to say so.
 *
 * The button label is driven by `currentPlayer.isReady`, which only changes
 * when a `game_state_updated` broadcast lands - this client has no optimistic
 * updates. Waiting for the flipped label is therefore waiting for the whole
 * round trip; asserting straight after the click would race it.
 */
export async function readyUp(page: Page): Promise<void> {
  await expect(readyButton(page)).toBeVisible();
  await readyButton(page).click();
  await expect(page.getByRole("button", { name: /Cancel Ready/ })).toBeVisible();
}

export function readyButton(page: Page) {
  return page.getByRole("button", { name: /Ready Up/ });
}

export function startButton(page: Page) {
  return page.getByRole("button", { name: "Start Game!" });
}

/** The status headline: "Game in progress!", "Round over!", "Game finished! ..." */
export function statusHeading(page: Page) {
  return page.getByRole("heading", { level: 2 });
}

/**
 * A player's card in the lobby roster, with their ready state.
 *
 * Scoped to the innermost element holding BOTH the username and a ready
 * indicator (the `PlayerCard` root). Matching the username alone does not work:
 * the app header renders the signed-in user's name too, so `getByText` matches
 * two elements for the current player and one for the opponent. Nothing here
 * has a test id to lean on.
 */
export function rosterCard(page: Page, username: string) {
  return page
    .locator("div")
    .filter({ hasText: username })
    .filter({ hasText: /(✓ Ready|✗ Not Ready)/ })
    .last();
}

/** A game's row in the dashboard listings, with its join button. */
export function listingCard(page: Page, gameName: string) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: gameName }) })
    .filter({ has: page.getByRole("button") })
    .last();
}

// ---------------------------------------------------------------------------
// N players, N browsers
// ---------------------------------------------------------------------------

export interface SeatedPlayer {
  user: TestUser;
  page: Page;
}

export interface SeatedTable {
  game: CreatedGame;
  /** The host first, then the guests in join order. */
  players: SeatedPlayer[];
  /** The same pages, for the loops that only want to look at every browser. */
  pages: Page[];
  close(): Promise<void>;
}

/**
 * The API allows 3 requests/second and 20/10s per IP, and every context in this
 * suite comes from 127.0.0.1. One seat is four requests - a dashboard load is
 * three on its own, then the create or join - so seating four players back to
 * back trips the throttler on the fixture's own setup. Spacing the seats keeps
 * the run under it.
 *
 * The interval is module-level, not per-call, so pacing carries across the test
 * boundary too: the worker is shared and the throttler's window does not reset
 * between tests.
 */
const SEAT_INTERVAL_MS = 1500;
let lastSeatedAt = 0;

async function paceSeat(): Promise<void> {
  const wait = lastSeatedAt + SEAT_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastSeatedAt = Date.now();
}

/**
 * Take a seat by invite code, watching the join call itself.
 *
 * `Dashboard.handleJoinGame` swallows a failed join into a `console.error` and
 * navigates only `if (game?.id)`, so a 429 and a refusal both surface as
 * "expected /game/<id>, got /dashboard". Reading the response says which.
 */
async function joinSeat(page: Page, game: CreatedGame): Promise<void> {
  const joined = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game/joinByCode") &&
      response.request().method() === "POST"
  );

  await joinByCodeViaUi(page, game.alias);

  const response = await joined;
  expect(
    response.status(),
    `POST /api/game/joinByCode: ${await response.text()}`
  ).toBe(201);

  await expect(page).toHaveURL(new RegExp(`/game/${game.id}$`));
}

/**
 * `playerCount` real players in one game, each in its own browser context.
 *
 * Contexts and not tabs: the JWT lives in localStorage, so one tab's token
 * would be every player.
 *
 * `onPageCreated` fires before a page navigates - the only moment a websocket
 * recorder can attach in time to see the handshake. Its `index` is the seat: 0
 * is the host.
 */
export async function seatPlayers(
  browser: Browser,
  options: {
    playerCount: number;
    /** Seats to open, when that must differ from the players seated. */
    maxPlayers?: number;
    isPrivate?: boolean;
    targetScore?: number;
    onPageCreated?: (page: Page, index: number) => void;
  }
): Promise<SeatedTable> {
  const contexts: BrowserContext[] = [];
  const players: SeatedPlayer[] = [];

  for (let index = 0; index < options.playerCount; index++) {
    const user = await createUser(index === 0 ? "host" : "guest");
    const context = await browser.newContext();
    const page = await context.newPage();

    contexts.push(context);
    options.onPageCreated?.(page, index);
    await authenticate(page, user);
    players.push({ user, page });
  }

  await paceSeat();
  const game = await createGameViaUi(players[0].page, {
    isPrivate: options.isPrivate,
    maxPlayers: options.maxPlayers ?? options.playerCount,
    targetScore: options.targetScore,
  });

  for (const { page } of players.slice(1)) {
    await paceSeat();
    await joinSeat(page, game);
  }

  return {
    game,
    players,
    pages: players.map((player) => player.page),
    async close() {
      for (const context of contexts) {
        await context.close();
      }
    },
  };
}

export interface SeatedGame extends SeatedTable {
  host: TestUser;
  guest: TestUser;
  hostPage: Page;
  guestPage: Page;
}

/** Two players, named. A `seatPlayers` table with the pair spelled out. */
export async function seatTwoPlayers(
  browser: Browser,
  options: {
    isPrivate?: boolean;
    onPageCreated?: (page: Page, role: "host" | "guest") => void;
  } = {}
): Promise<SeatedGame> {
  const { onPageCreated } = options;

  const table = await seatPlayers(browser, {
    playerCount: 2,
    isPrivate: options.isPrivate,
    onPageCreated:
      onPageCreated &&
      ((page, index) => onPageCreated(page, index === 0 ? "host" : "guest")),
  });

  const [host, guest] = table.players;

  return {
    ...table,
    close: () => table.close(),
    host: host.user,
    guest: guest.user,
    hostPage: host.page,
    guestPage: guest.page,
  };
}

/** Everyone ready, the host deals, and every board comes up. */
export async function readyUpAndStart(seated: SeatedTable): Promise<void> {
  for (const page of seated.pages) {
    await readyUp(page);
  }

  // The host's button only exists once the SERVER has told that page that
  // everyone is ready - it is rendered behind `allPlayersReady`.
  const hostPage = seated.pages[0];
  await expect(startButton(hostPage)).toBeEnabled();
  await startButton(hostPage).click();

  for (const page of seated.pages) {
    await expect(statusHeading(page)).toHaveText("Game in progress!");
  }
}

// ---------------------------------------------------------------------------
// Arranging states the UI cannot reach quickly
// ---------------------------------------------------------------------------
//
// These write to the test database directly. They are setup, never assertion:
// each puts the game in a state a real game genuinely reaches, and the test
// then drives the app through the transition and asserts what the APP does.

/** Lower the bar so a round can decide a game without a 100-point grind. */
export async function setTargetScore(gameId: string, targetScore: number): Promise<void> {
  await withDb(async (db) => {
    await db.query(`UPDATE games SET target_score = $1 WHERE id = $2`, [
      targetScore,
      gameId,
    ]);
  });
}

/**
 * Empty a player's blurtz pile - the one condition `callBlitz` checks, and the
 * only state from which the BLURTZ! button renders or `call_blitz` is accepted.
 * One UPDATE instead of ten legal moves.
 */
export async function emptyBlurtzPile(gameId: string, userId: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE players
          SET deck = jsonb_set(deck, '{blurtzPile,cards}', '[]'::jsonb)
        WHERE game_id = $1 AND user_id = $2`,
      [gameId, userId]
    );
  });
}

/** How many cards a player has banked this round - the scoring input. */
export async function setBankPileCount(
  gameId: string,
  userId: string,
  count: number
): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE players SET bank_pile_count = $1 WHERE game_id = $2 AND user_id = $3`,
      [count, gameId, userId]
    );
  });
}

/**
 * Set a player's readiness directly, to put the round-over interstitial into a
 * KNOWN state before testing its ready-up gate rather than inheriting whatever
 * the previous round left behind.
 */
export async function setReady(
  gameId: string,
  userId: string,
  isReady: boolean
): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE players SET is_ready = $1 WHERE game_id = $2 AND user_id = $3`,
      [isReady, gameId, userId]
    );
  });
}

/** The Player id (not the User id) - what the server reports as a winner. */
export async function readPlayerId(gameId: string, userId: string): Promise<string> {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT id FROM players WHERE game_id = $1 AND user_id = $2`,
      [gameId, userId]
    );
    return rows[0].id as string;
  });
}

export async function readGameRow(gameId: string): Promise<{
  status: string;
  currentRound: number;
  targetScore: number;
}> {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT status, current_round, target_score FROM games WHERE id = $1`,
      [gameId]
    );
    return {
      status: rows[0].status,
      currentRound: rows[0].current_round,
      targetScore: rows[0].target_score,
    };
  });
}
