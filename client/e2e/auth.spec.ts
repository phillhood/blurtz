import { test, expect } from "@playwright/test";
import { testUser } from "./fixtures/test-data";

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test.describe("Login Page", () => {
    test("should display login form", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
      await expect(page.getByPlaceholder(/username/i)).toBeVisible();
      await expect(page.getByPlaceholder(/password/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    });

    test("should show validation error for empty fields", async ({ page }) => {
      await page.goto("/login");

      await page.getByRole("button", { name: /login/i }).click();

      // Should show some form of error or validation
      const usernameInput = page.getByPlaceholder(/username/i);
      const passwordInput = page.getByPlaceholder(/password/i);

      // Check if inputs are required
      await expect(usernameInput).toHaveAttribute("required", "");
      await expect(passwordInput).toHaveAttribute("required", "");
    });

    test("should navigate to register page", async ({ page }) => {
      await page.goto("/login");

      await page.getByRole("link", { name: /register|sign up/i }).click();

      await expect(page).toHaveURL(/register/);
    });

    test("should show error for invalid credentials", async ({ page }) => {
      await page.goto("/login");

      await page.getByPlaceholder(/username/i).fill("invaliduser");
      await page.getByPlaceholder(/password/i).fill("wrongpassword");
      await page.getByRole("button", { name: /login/i }).click();

      // Should show an error message
      await expect(
        page.getByText(/invalid|error|failed/i).first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Register Page", () => {
    test("should display registration form", async ({ page }) => {
      await page.goto("/register");

      await expect(
        page.getByRole("heading", { name: /register|sign up/i })
      ).toBeVisible();
      await expect(page.getByPlaceholder(/username/i)).toBeVisible();
      await expect(page.getByPlaceholder(/password/i).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /register|sign up/i })
      ).toBeVisible();
    });

    test("should navigate to login page", async ({ page }) => {
      await page.goto("/register");

      await page.getByRole("link", { name: /login|sign in/i }).click();

      await expect(page).toHaveURL(/login/);
    });

    test("should register a new user successfully", async ({ page }) => {
      await page.goto("/register");

      const uniqueUsername = `user_${Date.now()}`;

      await page.getByPlaceholder(/username/i).fill(uniqueUsername);
      await page.getByPlaceholder(/password/i).first().fill(testUser.password);

      // If there's a confirm password field
      const confirmPassword = page.getByPlaceholder(/confirm/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill(testUser.password);
      }

      await page.getByRole("button", { name: /register|sign up/i }).click();

      // Should redirect to dashboard after successful registration
      await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
    });
  });

  test.describe("Logout", () => {
    test("should logout and redirect to login", async ({ page }) => {
      // First login
      await page.goto("/register");
      const uniqueUsername = `logout_test_${Date.now()}`;
      await page.getByPlaceholder(/username/i).fill(uniqueUsername);
      await page.getByPlaceholder(/password/i).first().fill(testUser.password);
      const confirmPassword = page.getByPlaceholder(/confirm/i);
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill(testUser.password);
      }
      await page.getByRole("button", { name: /register|sign up/i }).click();

      // Wait for dashboard
      await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

      // Find and click logout button
      const logoutButton = page.getByRole("button", { name: /logout/i });
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
        await expect(page).toHaveURL(/login/);
      }
    });
  });

  test.describe("Protected Routes", () => {
    test("should redirect to login when accessing dashboard without auth", async ({
      page,
    }) => {
      await page.goto("/dashboard");

      // Should be redirected to login
      await expect(page).toHaveURL(/login/, { timeout: 10000 });
    });

    test("should redirect to login when accessing game without auth", async ({
      page,
    }) => {
      await page.goto("/game/some-game-id");

      // Should be redirected to login
      await expect(page).toHaveURL(/login/, { timeout: 10000 });
    });
  });
});
