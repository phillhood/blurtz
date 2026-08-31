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

  /**
   * The whole script by tap alone - no drag, no "Show me". Three of the eight
   * steps target an EMPTY pile (the first bank pile, and two empty work piles),
   * which has no card to tap and so needs its own handler. Without this test the
   * tap path silently could not finish the tutorial.
   */
  test("the whole script can be completed by tapping, including onto empty piles", async ({
    page,
  }) => {
    await page.goto("/tutorial");
    await page.getByRole("button", { name: "Got it" }).click();

    // Cards carry their own id, so no step can pick up the wrong 2 or 7.
    const card = (id: string) => page.locator(`[data-card-id="${id}"]`);
    // Near the top edge, which is the strip a fanned card actually exposes -
    // the centre of a covered card belongs to the card sitting on it.
    const tap = async (id: string) => {
      const target = card(id);
      await target.scrollIntoViewIfNeeded();
      await target.click({ position: { x: 20, y: 8 } });
    };
    const emptyBank = page.getByRole("button", { name: "Empty bank pile" });
    const emptyWork = () => page.getByRole("button", { name: "Empty work pile" }).first();

    // 2: the red 1 from the Blurtz pile onto the empty bank slot.
    await tap("tut-red-1");
    await emptyBank.scrollIntoViewIfNeeded();
    await emptyBank.click();
    await expect(page.getByText("Step 3 of 8")).toBeVisible();

    // 3: the red 2 onto the red 1.
    await tap("tut-red-2");
    await tap("tut-red-1");
    await expect(page.getByText("Step 4 of 8")).toBeVisible();

    // 4: the green 5 onto the red 6.
    await tap("tut-green-5");
    await tap("tut-red-6");
    await expect(page.getByText("Step 5 of 8")).toBeVisible();

    // 5: the red 6, carrying the green 5, onto the green 7.
    await tap("tut-red-6");
    await tap("tut-green-7");
    await expect(page.getByText("Step 6 of 8")).toBeVisible();

    // 6: the yellow 7 onto an empty work pile.
    await tap("tut-yellow-7");
    await emptyWork().scrollIntoViewIfNeeded();
    await emptyWork().click();
    await expect(page.getByText("Step 7 of 8")).toBeVisible();

    // 7: flip the draw pile.
    await page.getByRole("button", { name: "Show me" }).click();
    await expect(page.getByText("Step 8 of 8")).toBeVisible();

    // 8: the last Blurtz card onto an empty work pile, then call it.
    await tap("tut-green-4");
    await emptyWork().scrollIntoViewIfNeeded();
    await emptyWork().click();
    await page.getByRole("button", { name: /BLURTZ/ }).click();

    await expect(page.getByText(/That is the whole game/i)).toBeVisible();
  });

  test("skip leaves immediately, without a confirm", async ({ page }) => {
    await page.goto("/tutorial");

    await page.getByRole("button", { name: "Skip the tutorial" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
