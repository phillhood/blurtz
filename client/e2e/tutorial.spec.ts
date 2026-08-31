import { test, expect, type Page } from "@playwright/test";

/**
 * Driven entirely signed out. The tutorial needs no account, no socket and no
 * server round trip, and that claim is the point of the route being unguarded.
 */
const step = (page: Page) => page.getByRole("progressbar");

test.describe("Tutorial", () => {
  test("opens signed out, with the board already dealt", async ({ page }) => {
    await page.goto("/tutorial");

    await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
    await expect(page.getByText("Step 1 of 8")).toBeVisible();
    await expect(page.locator(".blurtz-board")).toBeVisible();
    await expect(step(page)).toHaveAttribute("aria-valuenow", "1");
  });

  test("the opening lesson advances on Got it", async ({ page }) => {
    await page.goto("/tutorial");

    await page.getByRole("button", { name: "Got it" }).click();

    await expect(page.getByText("Step 2 of 8")).toBeVisible();
    await expect(step(page)).toHaveAttribute("aria-valuenow", "2");
    // A do step asks for a move instead of an acknowledgement.
    await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0);
  });

  test("a legal move that is not the coached one is nudged, and nothing moves", async ({
    page,
  }) => {
    await page.goto("/tutorial");
    await page.getByRole("button", { name: "Got it" }).click();

    // Step 2 wants the red 1 banked. Green 5 onto red 6 is legal Nertz, but
    // it is step 4's lesson, so the tutorial must refuse it and stay put.
    const green5 = page.locator(".blurtz-card").filter({ hasText: /^5$/ }).first();
    const red6 = page.locator(".blurtz-card").filter({ hasText: /^6$/ }).first();
    await green5.click();
    await red6.click();

    await expect(
      page.locator(".blurtz-coach").getByRole("status")
    ).toContainText(/not yet/i);
    await expect(page.getByText("Step 2 of 8")).toBeVisible();
  });

  test("Show me completes a step for a player who cannot find the card", async ({
    page,
  }) => {
    await page.goto("/tutorial");
    await page.getByRole("button", { name: "Got it" }).click();

    await page.getByRole("button", { name: "Show me" }).click();

    await expect(page.getByText("Step 3 of 8")).toBeVisible();
  });

  test("the whole script can be played to the end, and offers a real game after", async ({
    page,
  }) => {
    await page.goto("/tutorial");
    await page.getByRole("button", { name: "Got it" }).click();

    for (let i = 0; i < 7; i++) {
      await page.getByRole("button", { name: "Show me" }).click();
    }

    await page.getByRole("button", { name: /BLURTZ/ }).click();

    await expect(page.getByText(/That is the whole game/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in and play/ })).toBeVisible();
  });

  test("skip leaves immediately, without a confirm", async ({ page }) => {
    await page.goto("/tutorial");

    await page.getByRole("button", { name: "Skip the tutorial" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
