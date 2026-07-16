import { test, expect } from "@playwright/test";
import { authenticate, createUser } from "./fixtures/users";
import {
  createGameViaUi,
  readyButton,
  readyUp,
  readyUpAndStart,
  rosterCard,
  seatTwoPlayers,
  startButton,
  statusHeading,
} from "./fixtures/game";

/**
 * Two players in one game.
 *
 * This is the spec the suite exists for. The server is authoritative and the
 * client has no optimistic updates: every one of these assertions is really
 * asking whether a socket round trip happened and whether the OTHER browser
 * heard about it. A single-client test cannot ask that question.
 */
test.describe("Gameplay", () => {
  test("both players ready, the host deals, and both boards come up", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage, host, guest } = seated;

    // Before the deal there is no board.
    await expect(hostPage.getByText("Blurtz", { exact: true })).toBeHidden();

    await readyUpAndStart(seated);

    // Round 1 of a game played to the default target.
    await expect(hostPage.getByText("Round 1")).toBeVisible();
    await expect(hostPage.getByText("Playing to 100")).toBeVisible();

    // Both players got a board: their own piles, and the shared foundations.
    for (const page of [hostPage, guestPage]) {
      await expect(page.getByText("Bank", { exact: true })).toBeVisible();
      await expect(page.getByText("Draw", { exact: true })).toHaveCount(2);
      await expect(page.getByText("Work", { exact: true })).toHaveCount(2);
      await expect(page.getByText("Blurtz", { exact: true })).toHaveCount(2);
    }

    // Each player sees the OTHER one across the table, and both score zero.
    // Scoped to the opponents row because the app header renders the
    // signed-in user's own name too.
    await expect(
      hostPage.locator(".opponents-row").getByText(guest.username)
    ).toBeVisible();
    await expect(
      guestPage.locator(".opponents-row").getByText(host.username)
    ).toBeVisible();
    await expect(hostPage.getByText("Score: 0")).toHaveCount(2);

    // Cards were actually dealt: a blurtz pile's top card is face-up and has a
    // value on it. `NB` is the back of a face-down card - there are plenty.
    await expect(hostPage.getByText("NB").first()).toBeVisible();
    const values = await hostPage
      .locator("div")
      .filter({ hasText: /^([1-9]|10)$/ })
      .count();
    expect(values).toBeGreaterThan(0);

    // The leave button changed meaning now that the game is live.
    await expect(hostPage.getByRole("button", { name: "Forfeit" })).toBeVisible();

    await seated.close();
  });

  /**
   * Readiness is the server's answer, not the button's memory.
   *
   * This used to be an `if (await readyButton.isVisible())` around a click and
   * an assertion that the word "ready" appeared SOMEWHERE - which it does,
   * always, in the roster, so the test could not fail. It also predates the fix
   * that made this a round trip instead of local state, so the interesting part
   * is now whether the OTHER player sees it.
   */
  test("readiness round-trips through the server to the other player", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage, host } = seated;

    await expect(guestPage.getByText("✗ Not Ready")).toHaveCount(2);

    await readyUp(hostPage);

    // The guest's browser was told, over the socket, without a reload - and it
    // is the HOST's card that changed, not just some card.
    await expect(rosterCard(guestPage, host.username)).toContainText("✓ Ready");
    await expect(guestPage.getByText("✗ Not Ready")).toHaveCount(1);

    // And it un-readies, both ways.
    await hostPage.getByRole("button", { name: /Cancel Ready/ }).click();
    await expect(readyButton(hostPage)).toBeVisible();
    await expect(guestPage.getByText("✗ Not Ready")).toHaveCount(2);

    await seated.close();
  });

  test("only the host can deal", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage } = seated;

    await readyUp(hostPage);
    await readyUp(guestPage);

    await expect(startButton(hostPage)).toBeEnabled();
    // The guest is told to wait, and is given nothing to press.
    await expect(
      guestPage.getByText("Waiting for host to start game...")
    ).toBeVisible();
    await expect(startButton(guestPage)).toHaveCount(0);

    await seated.close();
  });

  test("a lone player cannot start, and is told why", async ({ page }) => {
    const host = await createUser("lonely");
    await authenticate(page, host);
    await createGameViaUi(page);

    await expect(
      page.getByRole("heading", { name: "Waiting for players... (1/2)" })
    ).toBeVisible();
    await expect(page.getByText("Share this game code with a friend:")).toBeVisible();
    // One player is not a game: there is no start button at all.
    await expect(startButton(page)).toHaveCount(0);
  });

  test("leaving a game that has not started returns to the dashboard", async ({
    page,
  }) => {
    const host = await createUser("leaver");
    await authenticate(page, host);
    const game = await createGameViaUi(page);

    await page.getByRole("button", { name: "Leave Game" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    // Gone, not just navigated away from: the game is no longer in the
    // player's own list.
    await expect(page.getByRole("heading", { name: game.name })).toBeHidden();
  });

  test("forfeiting a live game asks first, and ends it for the opponent", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    const { hostPage, guestPage, guest } = seated;

    await readyUpAndStart(seated);

    await hostPage.getByRole("button", { name: "Forfeit" }).click();
    await expect(hostPage.getByText("Forfeit Game")).toBeVisible();
    await expect(
      hostPage.getByText(/Are you sure you want to forfeit/)
    ).toBeVisible();

    await hostPage.getByRole("button", { name: "Forfeit", exact: true }).last().click();

    await expect(hostPage).toHaveURL(/\/dashboard$/);
    // The opponent wins by walking - and hears it over the socket, without
    // having touched anything.
    await expect(statusHeading(guestPage)).toContainText("Game finished!");
    await expect(
      guestPage.getByRole("row").filter({ hasText: guest.username })
    ).toBeVisible();

    await seated.close();
  });
});
