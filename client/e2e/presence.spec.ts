import { test, expect, type Page } from "@playwright/test";
import { readyUpAndStart, seatTwoPlayers, statusHeading } from "./fixtures/game";
import { findCards, recordSocketFrames, type SocketRecorder } from "./fixtures/socket";

/**
 * Losing a connection is not losing the game.
 *
 * A dropped socket leaves the `Player` row alone and `joinGame` returns early
 * for a player already in the game, so the drop is recoverable - but it used to
 * be silent: the server announced it as PLAYER_LEFT with no state, which the
 * client ignores, so a dropped opponent looked exactly like one who was
 * thinking. In a game where nobody waits for anybody, that is the only signal
 * there is.
 *
 * `setOffline` is a real drop: Chromium closes the websocket, and everything
 * from there - the server noticing, the retry, the re-join - is the actual
 * production path.
 */
test.describe("Presence", () => {
  /**
   * A blackholed socket sends no FIN, so the server only notices when the
   * heartbeat gives up - `pingInterval + pingTimeout`, which the gateway pins at
   * 10s + 10s. These tests wait on that, so they are slow by nature rather than
   * by flakiness, and the budget has to clear it with room to spare.
   */
  const DROP_DETECTION_MS = 30_000;

  test.setTimeout(90_000);

  /** The badge on an opponent's area, on someone else's screen. */
  function opponentDropped(page: Page) {
    return page.locator(".opponents-row").getByText("Disconnected");
  }

  function reconnectingBanner(page: Page) {
    return page.getByText("Reconnecting to game server...");
  }

  /**
   * Every face-down card in `frames`, proving both halves of redaction: a
   * hidden card carries its position and nothing else, and a visible one still
   * carries the value that makes the board playable.
   */
  function assertRedacted(recorder: SocketRecorder, fromIndex: number) {
    const cards = recorder.frames
      .slice(fromIndex)
      .flatMap((frame) => findCards(frame.args, frame.event));

    const hidden = cards.filter(({ card }) => card.faceUp === false);
    const visible = cards.filter(({ card }) => card.faceUp === true);

    for (const { path, card } of hidden) {
      expect(
        Object.keys(card).sort(),
        `face-down card at ${path} carries more than its position`
      ).toEqual(["faceUp", "id"]);
      expect(String(card.id)).toMatch(/^hidden:/);
    }

    return { hidden, visible };
  }

  test("the rest of the table sees a player drop", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    await readyUpAndStart(seated);

    await expect(opponentDropped(seated.hostPage)).toHaveCount(0);

    await seated.guestPage.context().setOffline(true);

    // The host is told by a presence broadcast the server derives from who is
    // left in the room - nothing writes this down anywhere.
    await expect(opponentDropped(seated.hostPage)).toBeVisible({
      timeout: DROP_DETECTION_MS,
    });
    await expect(
      seated.hostPage.locator(".opponents-row").getByText(seated.guest.username)
    ).toBeVisible();

    // The host's own game is untouched: a drop is not a forfeit.
    await expect(statusHeading(seated.hostPage)).toHaveText("Game in progress!");

    await seated.guestPage.context().setOffline(false);
    await seated.close();
  });

  test("a dropped player is told they are reconnecting, without losing the board", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    await readyUpAndStart(seated);

    await expect(reconnectingBanner(seated.guestPage)).toHaveCount(0);

    await seated.guestPage.context().setOffline(true);

    // The dropped client is on the same heartbeat: it notices its own silence
    // when the server's pings stop arriving.
    await expect(reconnectingBanner(seated.guestPage)).toBeVisible({
      timeout: DROP_DETECTION_MS,
    });
    // The board stays: it is still the game they are in, and blanking it would
    // cost them their place for a blip that resolves itself.
    await expect(statusHeading(seated.guestPage)).toHaveText("Game in progress!");
    await expect(seated.guestPage.getByText("Bank", { exact: true })).toBeVisible();

    await seated.guestPage.context().setOffline(false);

    await expect(reconnectingBanner(seated.guestPage)).toHaveCount(0, {
      timeout: DROP_DETECTION_MS,
    });

    await seated.close();
  });

  test("a dropped player resumes with correct, redacted state", async ({
    browser,
  }) => {
    const recorders: SocketRecorder[] = [];
    const seated = await seatTwoPlayers(browser, {
      onPageCreated: (page, role) => {
        if (role === "guest") recorders.push(recordSocketFrames(page));
      },
    });
    await readyUpAndStart(seated);

    const [guestRecorder] = recorders;
    await guestRecorder.waitFor("game_started");

    // Everything from here is what the RESUMED socket was sent - the frames
    // from before the drop would pass this on their own.
    const beforeDrop = guestRecorder.frames.length;

    await seated.guestPage.context().setOffline(true);
    await expect(opponentDropped(seated.hostPage)).toBeVisible({
      timeout: DROP_DETECTION_MS,
    });

    await seated.guestPage.context().setOffline(false);

    // Back in, and the host can see it - presence is derived, so it corrects
    // itself the moment the socket is in the room again.
    await expect(opponentDropped(seated.hostPage)).toHaveCount(0, {
      timeout: DROP_DETECTION_MS,
    });
    await expect(statusHeading(seated.guestPage)).toHaveText("Game in progress!");
    await expect(reconnectingBanner(seated.guestPage)).toHaveCount(0, {
      timeout: DROP_DETECTION_MS,
    });

    // The board came back dealt, not empty: three work piles per player at two
    // players, on both areas.
    await expect(seated.guestPage.locator(".work-piles")).toHaveCount(2);

    const { hidden, visible } = assertRedacted(guestRecorder, beforeDrop);

    // Only worth something if the resumed socket was sent a real board: a
    // 2-player deal buries 9 blurtz cards and a 25-card draw pile per player.
    expect(
      hidden.length,
      "the resumed socket was never sent a dealt board"
    ).toBeGreaterThan(60);
    expect(visible.length).toBeGreaterThan(0);

    await seated.close();
  });
});
