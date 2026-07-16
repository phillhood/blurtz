import { test, expect } from "@playwright/test";
import {
  emptyBlurtzPile,
  readGameRow,
  readPlayerId,
  readyUp,
  readyUpAndStart,
  rosterCard,
  seatTwoPlayers,
  setBankPileCount,
  setReady,
  setTargetScore,
  startButton,
  statusHeading,
  type SeatedGame,
} from "./fixtures/game";
import { recordSocketFrames, type SocketRecorder } from "./fixtures/socket";

/**
 * Multi-round scoring, end to end.
 *
 * A round ends when somebody empties their blurtz pile and calls it. Getting
 * there through the UI means ten legal drag-and-drops against a shuffled deal -
 * a test of dnd-kit and of luck, not of rounds. So the blurtz pile is emptied
 * in the database (the one condition `callBlitz` checks) and the app is driven
 * through the transition from there: the BLURTZ! button, the call, the
 * scoreboard, the ready-up, the next deal. Everything asserted is what the app
 * did with it.
 */

/**
 * Put the host one click away from calling Blurtz.
 *
 * The database edit alone is invisible to the browser: this client holds
 * whatever the last broadcast gave it and nothing has broadcast. So the host
 * reloads - which re-runs the real join, and the server answers with real,
 * freshly-read state. The BLURTZ! button then appears because that state says
 * the pile is empty.
 *
 * The button appearing is the app noticing, not the test asserting: it is
 * rendered behind `blurtzPile.cards.length === 0`, so waiting for it is
 * waiting for the round trip to have actually landed.
 */
async function armBlurtz(seated: SeatedGame, bankPileCount: number): Promise<void> {
  await emptyBlurtzPile(seated.game.id, seated.host.id);
  await setBankPileCount(seated.game.id, seated.host.id, bankPileCount);

  await seated.hostPage.reload();

  await expect(
    seated.hostPage.getByRole("button", { name: "BLURTZ!" })
  ).toBeVisible();
}

test.describe("Rounds", () => {
  test("a round ends, scores carry, and the next round deals", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage, host, guest } = seated;

    await readyUpAndStart(seated);
    await expect(hostPage.getByText("Round 1")).toBeVisible();

    // The host banked 6 cards this round; the guest banked none and is caught
    // with all 10 blurtz cards, which is 0 - 2*10 = -20. Nobody is near 100,
    // so this ends the ROUND, not the game.
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    // Both browsers are told the round is over.
    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toHaveText("Round over!");
      await expect(
        page.getByText(/Round 1 is over\. Nobody has reached\s+100 yet/)
      ).toBeVisible();
    }

    // The scoreboard shows what the SERVER scored, for both players.
    const hostRow = hostPage.getByRole("row").filter({ hasText: host.username });
    const guestRow = hostPage.getByRole("row").filter({ hasText: guest.username });
    await expect(hostRow).toContainText("+6");
    await expect(guestRow).toContainText("-20");
    await expect(
      hostPage.getByRole("columnheader", { name: "Total / 100" })
    ).toBeVisible();

    expect(await readGameRow(seated.game.id)).toMatchObject({
      status: "round_over",
      currentRound: 1,
    });

    // Both players are un-readied before the gate is exercised, so that this
    // tests the gate rather than whatever readiness round 1 left lying around.
    // (Today it leaves "ready" - see the expected-failure test below. Forcing
    // it here means this test keeps its meaning once that is fixed.)
    await setReady(seated.game.id, host.id, false);
    await setReady(seated.game.id, guest.id, false);
    await hostPage.reload();
    await guestPage.reload();

    await expect(hostPage.getByRole("button", { name: /Ready Up/ })).toBeVisible();
    await expect(startButton(hostPage)).toHaveCount(0);

    await readyUp(hostPage);
    await readyUp(guestPage);

    const nextRound = hostPage.getByRole("button", { name: "Start Round 2" });
    await expect(nextRound).toBeEnabled();
    await expect(
      guestPage.getByText("Waiting for host to deal the next round...")
    ).toBeVisible();
    await nextRound.click();

    // Round 2 is dealt, and the per-round bank count went back to zero while
    // the cumulative score survived the deal.
    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toHaveText("Game in progress!");
      await expect(page.getByText("Round 2")).toBeVisible();
      await expect(page.getByText("Score: 0")).toHaveCount(2);
    }

    expect(await readGameRow(seated.game.id)).toMatchObject({
      status: "playing",
      currentRound: 2,
    });

    await seated.close();
  });

  /**
   * BUG (real, not fixed here - out of scope for this task).
   *
   * A round ending does not clear anybody's readiness, so the interstitial's
   * "ready up for the next one" gate is already satisfied the moment it
   * appears: the host can deal round 2 before either player has looked at the
   * scoreboard.
   *
   * The asymmetry is the tell. `startNextRound` deals with
   * `dealDecks(tx, players, { bankPileCount: 0, roundScore: 0, isReady: false })`,
   * but `startGame` deals with `dealDecks(tx, game.players)` - no reset - so
   * the `isReady: true` everyone set in the LOBBY survives all of round 1 and
   * is still there at `round_over`. `callBlitz` does not clear it either.
   *
   * So the gate is skipped exactly once, on the round 1 -> 2 transition, and
   * works for every round after that (because round 2 was dealt with the
   * reset). That "works from round 2 onwards" is why it is easy to miss.
   */
  test("a round ending clears everyone's readiness", async ({ browser }) => {
    test.fail(
      true,
      "startGame deals without resetting isReady, so lobby readiness survives into round_over"
    );

    const seated = await seatTwoPlayers(browser);
    const { hostPage } = seated;

    await readyUpAndStart(seated);
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();
    await expect(statusHeading(hostPage)).toHaveText("Round over!");

    await expect(rosterCard(hostPage, seated.host.username)).toContainText(
      "✗ Not Ready"
    );

    await seated.close();
  });

  test("reaching the target score ends the game on the server", async ({
    browser,
  }) => {
    let hostRecorder!: SocketRecorder;
    const seated = await seatTwoPlayers(browser, {
      onPageCreated: (page, role) => {
        const recorder = recordSocketFrames(page);
        if (role === "host") hostRecorder = recorder;
      },
    });

    await readyUpAndStart(seated);

    // Playing to 5, and the host has banked six.
    await setTargetScore(seated.game.id, 5);
    await armBlurtz(seated, 6);
    await seated.hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    // The server scores it, ends the game, and says who won - on the wire.
    // Asserted here and not in the UI because the UI never hears it: see the
    // expected-failure test below.
    const ended = await hostRecorder.waitFor("game_ended");
    const payload = ended.args[0] as {
      gameState: { status: string };
      winnerId: string;
      reason: string;
    };

    expect(payload.reason).toEqual("blitz");
    expect(payload.gameState.status).toEqual("finished");
    expect(payload.winnerId).toEqual(
      await readPlayerId(seated.game.id, seated.host.id)
    );
    expect(await readGameRow(seated.game.id)).toMatchObject({ status: "finished" });

    await seated.close();
  });

  /**
   * BUG (real, user-facing, not fixed here - out of scope for this task).
   *
   * Winning by Blitz - the game's whole point - is never shown to anybody.
   *
   * `client/src/services/socket.service.ts` never subscribes to
   * `SOCKET_EVENTS.GAME_ENDED`. The callback is declared on `SocketCallbacks`
   * and `gameStore` implements it (`set({ gameState: data.gameState })`), but
   * no `this.socket.on(SOCKET_EVENTS.GAME_ENDED, ...)` exists to ever call it.
   * The handler is dead code. The server emits the event correctly on both
   * paths - the test above reads it off the wire.
   *
   * So a game won on points sits on "Game in progress!" until someone reloads.
   *
   * Forfeiting LOOKS fine, which is why this survived: `handleForfeitGame`
   * emits `GAME_STATE_UPDATED` before `GAME_ENDED`, and it is that first event
   * - one the client does subscribe to - which updates the board.
   * `handleCallBlitz` emits only `BLITZ_CALLED` and `GAME_ENDED`, so the
   * blitz path has nothing to fall back on.
   */
  test("the client shows a game won by Blitz as finished", async ({ browser }) => {
    test.fail(
      true,
      "socket.service.ts never subscribes to GAME_ENDED, so gameStore.onGameEnded is dead code"
    );

    const seated = await seatTwoPlayers(browser);
    const { hostPage } = seated;

    await readyUpAndStart(seated);
    await setTargetScore(seated.game.id, 5);
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    await expect(statusHeading(hostPage)).toContainText("Game finished!");

    await seated.close();
  });
});
