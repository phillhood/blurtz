import { test, expect } from "@playwright/test";
import { uniqueName } from "./fixtures/db";
import { E2E_PASSWORD, authenticate, createUser } from "./fixtures/users";

/**
 * The real register and login forms, through the real API.
 *
 * The ONE spec that goes through the front door for authentication - every
 * other spec seeds its user (`fixtures/users.ts`), because `/api/auth/register`
 * allows 5 requests a minute per IP. So this file is the only thing standing
 * behind the claim that a human can still get an account.
 */
test.describe("Authentication", () => {
  test("register, log out, and log back in", async ({ page }) => {
    const username = uniqueName("authuser");

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByPlaceholder("Confirm Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Registration signs you in: the header only renders for a logged-in user.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("banner").getByText(username)).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("banner")).toBeHidden();
    // The session is gone, not just the view: the token is what every API call
    // and the socket handshake read.
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();

    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("banner").getByText(username)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("token"))).not.toBeNull();
  });

  test("a wrong password is refused", async ({ page }) => {
    const user = await createUser("wrongpass");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(user.username);
    await page.getByPlaceholder("Password", { exact: true }).fill("definitely-not-it");

    // `/api/auth/login` is throttled to 1/sec per IP and the test above just
    // posted one. Without this wait the API answers 429 and the assertions pass
    // on a login that was never judged. There is no event to wait for: the
    // window is the throttler's clock.
    await page.waitForTimeout(1_100);

    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Sign In" }).click();

    // Pin the answer FIRST. "Still on /login with no token" is satisfied
    // identically by a 429, a 500 or a dropped connection; only a 401 means the
    // server looked at the credentials and said no.
    const response = await refused;
    expect(response.status(), await response.text()).toBe(401);

    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });

  /** What the app DOES with a 401 - the other half of the test above. */
  test("an invalid login shows the user an error", async ({ page }) => {
    const user = await createUser("noerror");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(user.username);
    await page.getByPlaceholder("Password", { exact: true }).fill("definitely-not-it");

    // Throttler window, as above. A 429 renders as an error too, so without
    // this wait the assertion below goes green on a login that was never
    // rejected. There is no event to wait for: the window is the clock.
    await page.waitForTimeout(1_100);

    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Sign In" }).click();

    // Pinned so a 429, a 500 or a network failure cannot masquerade as "the app
    // showed an error".
    const response = await refused;
    expect(response.status(), await response.text()).toBe(401);

    await expect(page.getByText("Invalid credentials")).toBeVisible();
    // The form survived the round trip: a retry is a retype of the password and
    // not of everything.
    await expect(page.getByPlaceholder("Username")).toHaveValue(user.username);
  });

  test("the login form links to register and back", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page.getByPlaceholder("Username")).toBeVisible();
    await expect(page.getByPlaceholder("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("Protected routes", () => {
    test("the dashboard is not reachable signed out", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    });

    test("a game page is not reachable signed out", async ({ page }) => {
      await page.goto("/game/8f14e45f-ceea-467a-9a3c-9e0b0f0d1234");
      await expect(page).toHaveURL(/\/login$/);
    });

    test("a signed-in user is bounced off the login page", async ({ page }) => {
      const user = await createUser("bounced");
      await authenticate(page, user);

      await page.goto("/login");

      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });
});
