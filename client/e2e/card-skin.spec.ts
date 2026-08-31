import { test, expect } from "@playwright/test";
import { seatPlayers } from "./fixtures/game";
import { createUser } from "./fixtures/users";

test("the chosen card skin is stored on the account and survives a reload", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const user = await createUser("skin");
  const context = await browser.newContext();
  const page = await context.newPage();

  // Deliberately NOT the `authenticate` fixture: it uses `addInitScript`, which
  // rewrites localStorage on every navigation and would keep restoring a user
  // with no stored preference. Seeding once is what a real session looks like.
  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("token", token), user.token);
  await page.goto("/dashboard");

  const written = page.waitForResponse(
    (r) =>
      r.url().includes("/api/auth/preferences") && r.request().method() === "PATCH"
  );
  await page.getByRole("radio", { name: "Emissive" }).click();
  expect((await written).status()).toBe(200);
  await expect(page.locator(".skin-emissive")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".skin-emissive")).toHaveCount(1);

  await context.close();
});

test("one player's skin never reaches another player's board", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const seated = await seatPlayers(browser, { playerCount: 2 });
  const page = seated.players[0].page;

  await page.goto("/dashboard");
  const written = page.waitForResponse(
    (r) =>
      r.url().includes("/api/auth/preferences") && r.request().method() === "PATCH"
  );
  await page.getByRole("radio", { name: "Emissive" }).click();
  expect((await written).status()).toBe(200);

  await page.goto(`/game/${seated.game.id}`);
  await expect(page.locator(".skin-emissive")).toHaveCount(1);

  // A skin is one viewer's display preference. If it reached the other player
  // it would be game state, which is exactly what it must not be.
  await expect(seated.players[1].page.locator(".skin-emissive")).toHaveCount(0);

  await seated.close();
});
