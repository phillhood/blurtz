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
 * Multi-round scoring, end to end. The blurtz pile is emptied in the database
 * (the one condition `callBlitz` checks) rather than by ten drag-and-drops
 * against a shuffled deal; everything asserted is what the app did with it.
 */

/**
 * Put the host one click away from calling Blurtz.
 *
 * The database edit is invisible to the browser until something broadcasts, so
 * the host reloads and the server answers with freshly-read state. The BLURTZ!
 * button renders behind `blurtzPile.cards.length === 0`, so waiting for it is
 * waiting for that round trip to land.
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

    // Host banks 6; the guest banks none and is caught with all 10 blurtz
    // cards, which is 0 - 2*10 = -20. Nobody is near 100, so this ends the
    // ROUND, not the game.
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toHaveText("Round over!");
      await expect(
        page.getByText(/Round 1 is over\. Nobody has reached\s+100 yet/)
      ).toBeVisible();
    }

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

    // Force both players un-ready, so this tests the gate rather than whatever
    // readiness the previous round left behind.
    await setReady(seated.game.id, host.id, false);
    await setReady(seated.game.id, guest.id, false);
    await hostPage.reload();
    await guestPage.reload();

    await expect(hostPage.getByRole("button", { name: /Ready Up/ })).toBeVisible();
    await expect(startButton(hostPage)).toHaveCount(0);

    // The guest's ready-up is the LAST one, so the server deals round 2 and
    // broadcasts immediately: that page never renders its own "Cancel Ready".
    // Hence the direct click - `readyUp` waits for the flipped label and would
    // hang here.
    await readyUp(hostPage);
    await readyButton(guestPage).click();

    // Round 2 deals with no button pressed: the per-round bank count resets
    // while the cumulative score survives.
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
   * Asserted through the interstitial's ready-up controls, not the roster:
   * `RoundOverSection` renders `<ReadySection showPlayers={false}>`, so there
   * are no "✓ Ready"/"✗ Not Ready" cards on this screen to read. `ReadyButton`'s
   * label is `currentPlayer.isReady` straight off the server's state, and a
   * shut gate is a table showing "Ready Up" and no "dealing the next round".
   */
  test("a round ending clears everyone's readiness", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage } = seated;

    await readyUpAndStart(seated);
    await armBlurtz(seated, 6);
    await hostPage.getByRole("button", { name: "BLURTZ!" }).click();

    for (const page of [hostPage, guestPage]) {
      await expect(statusHeading(page)).toHaveText("Round over!");
      // The label mirrors the server's `isReady`, so this asserts the server,
      // not a local flag.
      await expect(page.getByRole("button", { name: /Ready Up/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Cancel Ready/ })).toHaveCount(0);
      await expect(
        page.getByText("Waiting for all players to be ready (0/2)")
      ).toBeVisible();
    }

    // The gate is shut, not auto-dealing: with nobody ready the interstitial
    // shows no "dealing the next round" message, and there is no host deal
    // button between rounds.
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

    // Read off the wire: this pins what the SERVER decided. The test below
    // covers what a player is shown.
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
   * this asserts a PLAYER finds out. Asserted through the heading rather than
   * the store, because the heading is what a player actually sees.
   *
   * The Blitz path is the one that matters here: it emits only `BLITZ_CALLED`
   * and `GAME_ENDED`, so a client that mishandles `GAME_ENDED` has nothing to
   * fall back on. Forfeiting would hide that - it emits `GAME_STATE_UPDATED`
   * first, which updates the board on its own.
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
      // The winner by name: a UUID here means a raw Player id reached the text.
      await expect(statusHeading(page)).toContainText(
        `Winner: ${host.username}`
      );
    }

    await seated.close();
  });
});
