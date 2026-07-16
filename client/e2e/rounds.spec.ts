import { test, expect } from "@playwright/test";
import {
  emptyBlurtzPile,
  readGameRow,
  readPlayerId,
  readyButton,
  readyUp,
  readyUpAndStart,
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

    // No host action between rounds. The host readies up first; the guest's
    // ready-up is the LAST one, and the moment it lands the server deals round
    // 2 and broadcasts the fresh board. So the guest's page jumps straight to
    // "Game in progress!" and never shows its own "Cancel Ready" - which is why
    // this clicks the button directly rather than using `readyUp`, whose wait
    // for the flipped label would never resolve.
    await readyUp(hostPage);
    await readyButton(guestPage).click();

    // Round 2 is dealt automatically - no button was pressed - and the per-round
    // bank count went back to zero while the cumulative score survived the deal.
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
   * The round-over gate exists to make players confirm they are ready for the
   * next round. This asserts it is actually shut when the interstitial opens.
   *
   * It used to be a `test.fail()`. The asymmetry was the tell: the round
   * advance dealt with
   * `dealDecks(tx, players, { bankPileCount: 0, roundScore: 0, isReady: false })`,
   * but `startGame` dealt with `dealDecks(tx, game.players)` - no reset - so
   * the `isReady: true` everyone set in the LOBBY survived all of round 1 and
   * was still there at `round_over` (`callBlitz` does not clear it either).
   * Round 2 could deal before either player had looked at the scoreboard.
   *
   * The gate was therefore skipped exactly once, on the round 1 -> 2
   * transition, and worked for every round after that - because round 2 was
   * dealt WITH the reset. "Works from round 2 onwards" is why it survived.
   *
   * Asserted through the interstitial's ready-up controls rather than the
   * roster: `RoundOverSection` renders `<ReadySection showPlayers={false}>`
   * (the scoreboard above it already names everybody), so there are no
   * "✓ Ready"/"✗ Not Ready" cards on this screen to read. `ReadyButton`'s
   * label is `currentPlayer.isReady` straight off the server's state. There is
   * no host deal button any more - the round would advance the instant the
   * table went ready - so a shut gate is a table showing "Ready Up" and NOT the
   * "dealing the next round" message.
   */
  test("a round ending clears everyone's readiness", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage } = seated;

    await readyUpAndStart(seated);
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toHaveText("Round over!");
      // "Ready Up" and not "Cancel Ready": this player is NOT ready. The
      // label mirrors the server's `isReady`, so it is the server being
      // asserted here, not a local flag.
      await expect(page.getByRole("button", { name: /Ready Up/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Cancel Ready/ })).toHaveCount(0);
      await expect(
        page.getByText("Waiting for all players to be ready (0/2)")
      ).toBeVisible();
    }

    // The gate is shut, not auto-dealing: with nobody ready, the interstitial
    // is not showing the "dealing the next round" message, and the old host
    // "Start Round 2" button is gone for good.
    for (const page of [hostPage, guestPage]) {
      await expect(page.getByText(/dealing the next round/i)).toHaveCount(0);
    }
    await expect(
      hostPage.getByRole("button", { name: "Start Round 2" })
    ).toHaveCount(0);

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
   * The other end of the test above: the server said the game was won, and
   * this asserts that a PLAYER finds out.
   *
   * It used to be a `test.fail()`. `client/src/services/socket.service.ts`
   * never subscribed to `SOCKET_EVENTS.GAME_ENDED`, so the callback declared
   * on `SocketCallbacks` and implemented in `gameStore` was dead code - no
   * `this.socket.on(SOCKET_EVENTS.GAME_ENDED, ...)` existed to call it. A game
   * won on points sat on "Game in progress!" until somebody reloaded: the win
   * condition, which is the entire point of the game, was invisible.
   *
   * Forfeiting LOOKED fine, which is why this survived so long:
   * `handleForfeitGame` emits `GAME_STATE_UPDATED` before `GAME_ENDED`, and it
   * is that first event - one the client did subscribe to - which updated the
   * board. `handleCallBlitz` emits only `BLITZ_CALLED` and `GAME_ENDED`, so
   * the Blitz path had nothing to fall back on.
   *
   * Asserted through the heading and not the store, because the heading is
   * what a player actually sees. The winner is named: it used to interpolate
   * `gameState.winner` - a Player id - straight into the text.
   */
  test("the client shows a game won by Blitz as finished", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage, host } = seated;

    await readyUpAndStart(seated);
    await setTargetScore(seated.game.id, 5);
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    // Both browsers, not just the winner's: `game_ended` goes to the room.
    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toContainText("Game finished!");
      // The winner by name. A UUID here is the bug this test was written for.
      await expect(statusHeading(page)).toContainText(
        `Winner: ${host.username}`
      );
    }

    await seated.close();
  });
});
