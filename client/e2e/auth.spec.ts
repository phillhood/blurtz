import { test, expect } from "@playwright/test";
import { uniqueName } from "./fixtures/db";
import { E2E_PASSWORD, authenticate, createUser } from "./fixtures/users";

/**
 * The real register and login forms, through the real API.
 *
 * This is the ONE spec that goes through the front door for authentication -
 * every other spec seeds its user (see `fixtures/users.ts`), because
 * `/api/auth/register` allows 5 requests a minute per IP and a suite that
 * registered its way through every test would spend its life in a 429. Which
 * means this file is the only thing standing behind the claim that a human can
 * still get an account, so it drives the whole round trip rather than checking
 * that a form renders.
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

    // Registration signs you in: the header only renders for a logged-in user,
    // and it renders THIS user's name.
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
    await page.getByRole("button", { name: "Sign In" }).click();

    // Refused means refused: no session, no redirect. The API answers 401
    // "Invalid credentials" - what the app does NOT do with that answer is the
    // subject of the expected-failure test below.
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });

  /**
   * What the app DOES with a 401 - the other half of the test above.
   *
   * This used to be a `test.fail()`. A rejected login told the user nothing:
   *
   *   1. `authStore.login` began by setting the store-wide `loading: true`.
   *   2. `App.tsx` read that same `loading` and returned `<div>Loading...</div>`
   *      INSTEAD of the router - so the whole tree, `<Login>` included,
   *      unmounted while the request was in flight.
   *   3. The request failed, `loading` went false, and `App` mounted a BRAND
   *      NEW `<Login>` - whose local `error` state is `""`, because it is a new
   *      component. `Login.tsx`'s `setError(err.message)` had run on the corpse
   *      of the old one.
   *
   * The user got a flash of "Loading...", then an empty login form: no error,
   * and the username they typed gone too.
   *
   * The fix was to stop conflating two different things called `loading`.
   * `authStore.loading` means "the persisted session is still being resolved" -
   * the one case where `App` genuinely has nothing to route - and `login` no
   * longer touches it. Both forms already had their own local in-flight state.
   */
  test("an invalid login shows the user an error", async ({ page }) => {
    const user = await createUser("noerror");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(user.username);
    await page.getByPlaceholder("Password", { exact: true }).fill("definitely-not-it");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Invalid credentials")).toBeVisible();
    // The form survived the round trip, so a retry is a retype of the password
    // and not of everything.
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
