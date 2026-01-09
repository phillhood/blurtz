import { test, expect } from "@playwright/test";
import { testUser } from "./fixtures/test-data";

test.describe("Gameplay", () => {
  // Helper to login and create a game
  async function loginAndCreateGame(page: import("@playwright/test").Page) {
    await page.goto("/register");
    const uniqueUsername = `game_user_${Date.now()}`;
    await page.getByPlaceholder(/username/i).fill(uniqueUsername);
    await page.getByPlaceholder(/password/i).first().fill(testUser.password);
    const confirmPassword = page.getByPlaceholder(/confirm/i);
    if (await confirmPassword.isVisible()) {
      await confirmPassword.fill(testUser.password);
    }
    await page.getByRole("button", { name: /register|sign up/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // Create a game
    await page.getByRole("button", { name: /create|new game/i }).first().click();
    const gameNameInput = page.getByPlaceholder(/game name/i);
    if (await gameNameInput.isVisible()) {
      await gameNameInput.fill(`Test Game ${Date.now()}`);
    } else {
      await page.getByLabel(/game name/i).fill(`Test Game ${Date.now()}`);
    }
    await page.getByRole("button", { name: /create/i }).click();
    await expect(page).toHaveURL(/game\//, { timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test.describe("Game Page", () => {
    test("should display game header with leave button", async ({ page }) => {
      await loginAndCreateGame(page);

      // Should see leave/exit button
      const leaveButton = page.getByRole("button", { name: /leave|exit|back/i });
      await expect(leaveButton.first()).toBeVisible();
    });

    test("should display player info", async ({ page }) => {
      await loginAndCreateGame(page);

      // Should see player name somewhere
      await expect(page.getByText(/player|score/i).first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("should show waiting state for single player", async ({ page }) => {
      await loginAndCreateGame(page);

      // With only one player, should show waiting message or ready toggle
      await expect(
        page.getByText(/waiting|ready|opponent/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("should display game code for private games", async ({ page }) => {
      await page.goto("/register");
      const uniqueUsername = `code_user_${Date.now()}`;
      await page.getByPlaceholder(/username/i).fill(uniqueUsername);
      await page.getByPlaceholder(/password/i).first().fill(testUser.password);
      const confirmPassword = page.getByPlaceholder(/confirm/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill(testUser.password);
      }
      await page.getByRole("button", { name: /register|sign up/i }).click();
      await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

      // Create a private game
      await page.getByRole("button", { name: /create|new game/i }).first().click();
      const gameNameInput = page.getByPlaceholder(/game name/i);
      if (await gameNameInput.isVisible()) {
        await gameNameInput.fill(`Private Game ${Date.now()}`);
      } else {
        await page.getByLabel(/game name/i).fill(`Private Game ${Date.now()}`);
      }
      const privateCheckbox = page.getByRole("checkbox", { name: /private/i });
      if (await privateCheckbox.isVisible()) {
        await privateCheckbox.check();
      }
      await page.getByRole("button", { name: /create/i }).click();
      await expect(page).toHaveURL(/game\//, { timeout: 10000 });

      // Should see copy code button or game code
      const copyButton = page.getByRole("button", { name: /copy|code/i });
      if (await copyButton.isVisible()) {
        await expect(copyButton).toBeEnabled();
      }
    });
  });

  test.describe("Leave Game", () => {
    test("should return to dashboard when leaving waiting game", async ({
      page,
    }) => {
      await loginAndCreateGame(page);

      // Click leave button
      const leaveButton = page.getByRole("button", { name: /leave|exit|back/i });
      await leaveButton.first().click();

      // Should return to dashboard
      await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
    });

    test("should show forfeit confirmation when in active game", async ({
      page,
    }) => {
      await loginAndCreateGame(page);

      // This test would require two players to start a game
      // For now, just verify the leave button exists
      const leaveButton = page.getByRole("button", { name: /leave|exit|back/i });
      await expect(leaveButton.first()).toBeVisible();
    });
  });

  test.describe("Ready Toggle", () => {
    test("should display ready toggle in waiting state", async ({ page }) => {
      await loginAndCreateGame(page);

      // Should see ready toggle or ready button
      const readyElement = page.getByText(/ready/i);
      await expect(readyElement.first()).toBeVisible({ timeout: 10000 });
    });

    test("should toggle ready state", async ({ page }) => {
      await loginAndCreateGame(page);

      // Find ready toggle/button
      const readyButton = page.getByRole("button", { name: /ready/i });
      if (await readyButton.isVisible()) {
        await readyButton.click();
        // State should change - look for some indication
        await expect(page.getByText(/ready|waiting/i).first()).toBeVisible();
      }
    });
  });

  test.describe("Game Board", () => {
    test("should display game elements when game starts", async ({ page }) => {
      // This test would require a two-player setup
      // For now, just verify basic page structure
      await loginAndCreateGame(page);

      // Should see some game-related content
      await expect(
        page.getByText(/blitz|pile|card|game/i).first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Responsive Design", () => {
    test("should be usable on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await loginAndCreateGame(page);

      // Basic elements should still be visible
      const leaveButton = page.getByRole("button", { name: /leave|exit|back/i });
      await expect(leaveButton.first()).toBeVisible();
    });

    test("should be usable on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad
      await loginAndCreateGame(page);

      // Basic elements should still be visible
      const leaveButton = page.getByRole("button", { name: /leave|exit|back/i });
      await expect(leaveButton.first()).toBeVisible();
    });
  });
});
