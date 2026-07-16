import { expect, type Browser, type Page } from "@playwright/test";
import { uniqueName, withDb } from "./db";
import { authenticate, createUser, type TestUser } from "./users";

export interface CreatedGame {
  id: string;
  name: string;
  alias: string;
}

/**
 * Create a game through the real dashboard, and read back what the app says it
 * made.
 *
 * The id comes out of the URL and the invite code out of the header, because
 * those are the two things the rest of a test needs and both are things the
 * app had to get right to display. Nothing here is read from the database:
 * this is a flow, not a fixture.
 */
/**
 * Wait for the game socket to have finished connecting.
 *
 * Not politeness - a correctness requirement, and a real bug's fault.
 * `gameStore.createAndJoinGame` opens with:
 *
 *     if (!userId || !socketService.connected) {
 *       set({ error: "Not connected to game server" });
 *       return null;
 *     }
 *
 * and `Dashboard.handleCreateGame` only navigates `if (game?.id)`. So pressing
 * Create Game before the socket has come up does NOTHING AT ALL: no game, no
 * navigation, and no message, because the Dashboard never renders gameStore's
 * error. A test that clicks as fast as Playwright does hits that window
 * regularly; a human occasionally will too, and will just see a dead button.
 *
 * Resolves on the socket.io CONNECT ack (engine.io `40`) - the frame whose
 * arrival is what sets `socketService.connected` - so this waits on the real
 * event rather than a guess about how long it takes.
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

export async function createGameViaUi(
  page: Page,
  options: { isPrivate?: boolean; name?: string } = {}
): Promise<CreatedGame> {
  const name = options.name ?? uniqueName("game");

  const connected = gameSocketConnected(page);
  await page.goto("/dashboard");
  await connected;

  await page.getByRole("button", { name: "New Game" }).click();

  await expect(page.getByRole("heading", { name: "Create New Game" })).toBeVisible();
  await page.getByPlaceholder("Enter game name...").fill(name);

  if (options.isPrivate) {
    // The only checkbox in the modal. It has no accessible name of its own -
    // see the note in the lobby spec about its label pointing at the wrong id.
    await page.getByRole("checkbox").check();
  }

  // Watch the create call itself. Without this, everything that can go wrong
  // here - a rate-limited 429, a socket that was not up so no request was made
  // at all - surfaces identically and uselessly as "expected /game/<id>, got
  // /dashboard" five seconds later. The Dashboard swallows all of it: it
  // navigates `if (game?.id)` and says nothing otherwise.
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Create Game" }).click();
  const response = await created;
  expect(response.status(), `POST /api/game: ${await response.text()}`).toBe(201);

  await expect(page).toHaveURL(/\/game\/[0-9a-f-]{36}$/);
  const id = page.url().split("/game/")[1];

  // The header renders the code the server generated, so waiting for it to be
  // non-empty is waiting for the socket to have delivered game state. The
  // `expect` is what does the waiting - reading `innerText()` straight out
  // races the first render, which paints the header before any state arrives.
  await expect(gameCode(page)).not.toBeEmpty();
  const alias = await gameCode(page).innerText();

  return { id, name, alias };
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
 * when a `game_state_updated` broadcast lands - there are no optimistic
 * updates in this client. Asserting the flipped label is therefore asserting
 * the whole round trip: click -> `player_ready` -> server writes -> broadcast
 * -> store replaced -> re-render. An assertion made immediately after the
 * click would be racing that, which is what the old suite did.
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
 * Scoped by "the innermost element containing BOTH this username and a ready
 * indicator", which is the `PlayerCard` root. Bluntly matching the username
 * does not work: the app header renders the signed-in user's name too, so
 * `getByText(username)` is two elements for the current player and one for the
 * opponent - a locator that means something different depending on who is
 * looking at it. Nothing here has a test id to lean on.
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
// Two players, two browsers
// ---------------------------------------------------------------------------

export interface SeatedGame {
  game: CreatedGame;
  host: TestUser;
  guest: TestUser;
  hostPage: Page;
  guestPage: Page;
  close(): Promise<void>;
}

/**
 * Two real players in one game, in two real browser contexts.
 *
 * Two contexts and not two tabs: they need separate localStorage, because the
 * JWT lives there and one tab's token would otherwise be both players. This is
 * also the only way the concurrency that matters here shows up at all - a
 * single client can never observe that its opponent's readiness arrived over a
 * socket rather than out of its own state.
 *
 * `onPageCreated` fires before either page navigates, which is the only moment
 * a websocket recorder can be attached in time to see the handshake.
 */
export async function seatTwoPlayers(
  browser: Browser,
  options: {
    isPrivate?: boolean;
    onPageCreated?: (page: Page, role: "host" | "guest") => void;
  } = {}
): Promise<SeatedGame> {
  const host = await createUser("host");
  const guest = await createUser("guest");

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  options.onPageCreated?.(hostPage, "host");
  options.onPageCreated?.(guestPage, "guest");

  await authenticate(hostPage, host);
  await authenticate(guestPage, guest);

  const game = await createGameViaUi(hostPage, { isPrivate: options.isPrivate });
  await joinByCodeViaUi(guestPage, game.alias);
  await expect(guestPage).toHaveURL(new RegExp(`/game/${game.id}$`));

  return {
    game,
    host,
    guest,
    hostPage,
    guestPage,
    async close() {
      await hostContext.close();
      await guestContext.close();
    },
  };
}

/**
 * Both players ready, host deals, both boards come up.
 *
 * Every wait in here is on a server round trip - readiness, the deal, the
 * other player's view of both. Nothing is assumed to have happened because a
 * click happened.
 */
export async function readyUpAndStart(seated: SeatedGame): Promise<void> {
  const { hostPage, guestPage } = seated;

  await readyUp(hostPage);
  await readyUp(guestPage);

  // The host's button only exists once the SERVER has told this page that
  // everyone is ready - it is rendered behind `allPlayersReady`.
  await expect(startButton(hostPage)).toBeEnabled();
  await startButton(hostPage).click();

  await expect(statusHeading(hostPage)).toHaveText("Game in progress!");
  await expect(statusHeading(guestPage)).toHaveText("Game in progress!");
}

// ---------------------------------------------------------------------------
// Arranging states the UI cannot reach quickly
// ---------------------------------------------------------------------------
//
// The helpers below write to the test database directly. They are setup, never
// assertion: each one puts the game in a state a real game genuinely reaches,
// and the test then drives the app through the transition and asserts what the
// APP does. The alternative for a round-over test is playing ten real cards
// through drag-and-drop, which would be a test of dnd-kit.

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
 * Empty a player's blurtz pile - the one condition `callBlitz` checks.
 *
 * This is what a player who has just banked their last blurtz card looks like,
 * and it is the only state from which the BLURTZ! button appears (the client)
 * or `call_blitz` is accepted (the server). Reached here in one UPDATE instead
 * of ten legal moves.
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
 * Set a player's readiness directly.
 *
 * Used to put the round-over interstitial into a KNOWN state before testing
 * its ready-up gate, rather than inheriting whatever readiness the previous
 * round happened to leave behind (which today is "still ready from the lobby" -
 * see the expected-failure test in rounds.spec.ts). Forcing it means that test
 * asserts the gate itself, and keeps asserting it whichever way the underlying
 * bug is eventually fixed.
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
