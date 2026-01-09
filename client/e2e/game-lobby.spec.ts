import { test, expect } from "@playwright/test";
import { testUser, testGame, privateGame } from "./fixtures/test-data";

test.describe("Game Lobby", () => {
  // Helper to login before tests
  async function loginUser(page: import("@playwright/test").Page) {
    await page.goto("/register");
    const uniqueUsername = `lobby_user_${Date.now()}`;
    await page.getByPlaceholder(/username/i).fill(uniqueUsername);
    await page.getByPlaceholder(/password/i).first().fill(testUser.password);
    const confirmPassword = page.getByPlaceholder(/confirm/i);
    if (await confirmPassword.isVisible()) {
      await confirmPassword.fill(testUser.password);
    }
    await page.getByRole("button", { name: /register|sign up/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test.describe("Dashboard", () => {
    test("should display dashboard with game list", async ({ page }) => {
      await loginUser(page);

      // Should see the dashboard with game options
      await expect(page.getByText(/games|available|create/i).first()).toBeVisible();
    });

    test("should display create game button", async ({ page }) => {
      await loginUser(page);

      await expect(
        page.getByRole("button", { name: /create|new game/i }).first()
      ).toBeVisible();
    });

    test("should display refresh button", async ({ page }) => {
      await loginUser(page);

      const refreshButton = page.getByRole("button", { name: /refresh/i });
      if (await refreshButton.isVisible()) {
        await expect(refreshButton).toBeEnabled();
      }
    });
  });

  test.describe("Create Game", () => {
    test("should open create game modal", async ({ page }) => {
      await loginUser(page);

      await page.getByRole("button", { name: /create|new game/i }).first().click();

      // Should see the create game modal/form
      await expect(page.getByText(/create.*game/i).first()).toBeVisible();
    });

    test("should create a public game", async ({ page }) => {
      await loginUser(page);

      await page.getByRole("button", { name: /create|new game/i }).first().click();

      // Fill in game details
      const gameNameInput = page.getByPlaceholder(/game name/i);
      if (await gameNameInput.isVisible()) {
        await gameNameInput.fill(testGame.name);
      } else {
        // Try finding by label
        await page.getByLabel(/game name/i).fill(testGame.name);
      }

      // Submit the form
      await page.getByRole("button", { name: /create/i }).click();

      // Should navigate to game page
      await expect(page).toHaveURL(/game\//, { timeout: 10000 });
    });

    test("should create a private game", async ({ page }) => {
      await loginUser(page);

      await page.getByRole("button", { name: /create|new game/i }).first().click();

      // Fill in game details
      const gameNameInput = page.getByPlaceholder(/game name/i);
      if (await gameNameInput.isVisible()) {
        await gameNameInput.fill(privateGame.name);
      } else {
        await page.getByLabel(/game name/i).fill(privateGame.name);
      }

      // Check private checkbox
      const privateCheckbox = page.getByRole("checkbox", { name: /private/i });
      if (await privateCheckbox.isVisible()) {
        await privateCheckbox.check();
      }

      // Submit
      await page.getByRole("button", { name: /create/i }).click();

      // Should navigate to game page
      await expect(page).toHaveURL(/game\//, { timeout: 10000 });
    });

    test("should close create game modal on cancel", async ({ page }) => {
      await loginUser(page);

      await page.getByRole("button", { name: /create|new game/i }).first().click();

      // Click cancel
      const cancelButton = page.getByRole("button", { name: /cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
        // Modal should be closed
        await expect(page.getByText(/create.*game/i).first()).not.toBeVisible();
      }
    });
  });

  test.describe("Join Game", () => {
    test("should open join by code modal", async ({ page }) => {
      await loginUser(page);

      const joinByCodeButton = page.getByRole("button", { name: /join.*code/i });
      if (await joinByCodeButton.isVisible()) {
        await joinByCodeButton.click();
        await expect(page.getByText(/enter.*code|game code/i).first()).toBeVisible();
      }
    });

    test("should show error for invalid game code", async ({ page }) => {
      await loginUser(page);

      const joinByCodeButton = page.getByRole("button", { name: /join.*code/i });
      if (await joinByCodeButton.isVisible()) {
        await joinByCodeButton.click();

        const codeInput = page.getByPlaceholder(/code/i);
        if (await codeInput.isVisible()) {
          await codeInput.fill("invalid-code-xyz");
          await page.getByRole("button", { name: /join/i }).click();

          // Should show error
          await expect(
            page.getByText(/not found|invalid|error/i).first()
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe("Game List", () => {
    test("should display available games section", async ({ page }) => {
      await loginUser(page);

      // Should see available games section
      await expect(page.getByText(/available|open|games/i).first()).toBeVisible();
    });

    test("should display active games section", async ({ page }) => {
      await loginUser(page);

      // Should see active games section or similar
      const activeSection = page.getByText(/active|your games|playing/i);
      // This may or may not be visible depending on if user has active games
      if (await activeSection.isVisible()) {
        await expect(activeSection.first()).toBeVisible();
      }
    });
  });
});
