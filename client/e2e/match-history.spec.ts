import { test, expect } from "@playwright/test";
import {
  emptyBlurtzPile,
  readyUpAndStart,
  seatTwoPlayers,
  setBankPileCount,
  setTargetScore,
  type SeatedGame,
} from "./fixtures/game";
import { authenticate, createUser } from "./fixtures/users";

/**
 * Drive a real two-player game to `finished`, which is the only state the
 * history API returns. Mirrors `rounds.spec.ts`'s approach: the scoring inputs
 * are set in the database, and the host reloads so the server answers with
 * freshly-read state.
 */
async function playToFinish(seated: SeatedGame): Promise<void> {
  await readyUpAndStart(seated);
  await setTargetScore(seated.game.id, 5);
  await emptyBlurtzPile(seated.game.id, seated.host.id);
  await setBankPileCount(seated.game.id, seated.host.id, 6);
  await seated.hostPage.reload();
  await expect(
    seated.hostPage.getByRole("button", { name: "BLURTZ!" })
  ).toBeVisible();
  await seated.hostPage.getByRole("button", { name: "BLURTZ!" }).click();
}

test.describe("Match history", () => {
  test("a finished game shows up, and opens its own results page", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    await playToFinish(seated);

    const page = seated.hostPage;
    await page.goto("/profile/history");

    const row = page.getByRole("button", { name: new RegExp(seated.game.name) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Won");

    await row.click();

    await expect(page).toHaveURL(/\/profile\/history\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: seated.game.name })).toBeVisible();

    // The chart and the table are both present; the table is the chart's
    // accessible equivalent, so it must never be the one that is missing.
    await expect(page.getByRole("img", { name: /Cumulative score/i })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Round 1" })).toBeVisible();

    await seated.close();
  });

  test("history is reachable from the profile tabs", async ({ browser }) => {
    const seated = await seatTwoPlayers(browser);
    await playToFinish(seated);

    const page = seated.hostPage;
    await page.goto("/profile");
    await page.getByRole("tab", { name: "History" }).click();

    await expect(page).toHaveURL(/\/profile\/history$/);
    await expect(
      page.getByRole("button", { name: new RegExp(seated.game.name) })
    ).toBeVisible();

    await seated.close();
  });

  test("a player who never sat at the table is refused its results", async ({
    browser,
  }) => {
    const seated = await seatTwoPlayers(browser);
    await playToFinish(seated);

    const outsider = await createUser("outsider");
    const context = await browser.newContext();
    const page = await context.newPage();
    await authenticate(page, outsider);

    await page.goto(`/profile/history/${seated.game.id}`);

    // 403 for a non-member AND for a game that does not exist, so the copy must
    // never confirm which one it was.
    await expect(page.getByText(/not yours to view/i)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await context.close();
    await seated.close();
  });

  test("a player with no finished games is told so, not shown an empty page", async ({
    page,
  }) => {
    const fresh = await createUser("nohistory");
    await authenticate(page, fresh);

    await page.goto("/profile/history");

    await expect(page.getByText("No finished games yet")).toBeVisible();
  });
});
