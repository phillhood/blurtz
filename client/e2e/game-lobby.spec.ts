import { test, expect } from "@playwright/test";
import { API_URL } from "./fixtures/env";
import { authenticate, createUser } from "./fixtures/users";
import {
  createGameViaUi,
  gameCode,
  joinByCodeViaUi,
  listingCard,
  rosterCard,
} from "./fixtures/game";

test.describe("Game lobby", () => {
  test("creating a public game lands the host in it", async ({ page }) => {
    const host = await createUser("host");
    await authenticate(page, host);

    const game = await createGameViaUi(page, { name: "e2e_lobby_public" });

    // The header is fed from socket-delivered game state, so all three of
    // these are also evidence the socket authenticated and joined the room.
    await expect(page.getByText("e2e_lobby_public")).toBeVisible();
    await expect(gameCode(page)).toHaveText(game.alias);
    await expect(
      page.getByRole("heading", { name: "Waiting for players... (1/2)" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave Game" })).toBeVisible();
  });

  test("a public game shows up in another player's listings and can be joined", async ({
    page,
    browser,
  }) => {
    const host = await createUser("host");
    await authenticate(page, host);
    const game = await createGameViaUi(page, { name: "e2e_lobby_listed" });

    const joiner = await createUser("joiner");
    const context = await browser.newContext();
    const joinerPage = await context.newPage();
    await authenticate(joinerPage, joiner);

    await joinerPage.goto("/dashboard");

    const listing = listingCard(joinerPage, game.name);
    await expect(listing).toBeVisible();
    await expect(listing.getByText("1 of 2 seats taken")).toBeVisible();

    await listing.getByRole("button", { name: "Join", exact: true }).click();

    await expect(joinerPage).toHaveURL(new RegExp(`/game/${game.id}$`));
    // The host's page is told about the arrival over the socket, without a
    // reload - which is the actual claim being tested. A full lobby swaps the
    // "waiting for players" headline for the ready-up section, so the host's
    // view has genuinely moved on, not just gained a name.
    await expect(rosterCard(page, joiner.username)).toBeVisible();
    await expect(
      page.getByText("Waiting for all players to be ready (0/2)")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Waiting for players/ })
    ).toBeHidden();

    await context.close();
  });

  test("joining by invite code puts both players in the game", async ({
    page,
    browser,
  }) => {
    const host = await createUser("host");
    await authenticate(page, host);
    const game = await createGameViaUi(page, { isPrivate: true });

    const joiner = await createUser("joiner");
    const context = await browser.newContext();
    const joinerPage = await context.newPage();
    await authenticate(joinerPage, joiner);

    await joinByCodeViaUi(joinerPage, game.alias);

    await expect(joinerPage).toHaveURL(new RegExp(`/game/${game.id}$`));
    await expect(rosterCard(joinerPage, host.username)).toBeVisible();
    await expect(rosterCard(joinerPage, joiner.username)).toBeVisible();
    // The host is told about it too, over the socket.
    await expect(rosterCard(page, joiner.username)).toBeVisible();

    await context.close();
  });

  test("an invite code that does not exist is refused", async ({ page }) => {
    const user = await createUser("badcode");
    await authenticate(page, user);

    await joinByCodeViaUi(page, "no-such-code-xyz");

    // Refused: still on the dashboard, no game entered.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Join by code" })).toBeVisible();
  });

  /**
   * Knowing a private game's id is not permission to enter it.
   *
   * Asserted against the API rather than the UI on purpose: the UI never
   * offers the button, precisely BECAUSE a private game is kept out of the
   * listings - so a UI-only test would pass just as happily against a server
   * that let anyone in by id. The attacker in this story does not use the
   * dashboard.
   */
  test("a private game is hidden from listings and cannot be joined by id", async ({
    page,
    request,
  }) => {
    const host = await createUser("host");
    await authenticate(page, host);
    const game = await createGameViaUi(page, {
      name: "e2e_lobby_private",
      isPrivate: true,
    });

    const outsider = await createUser("outsider");

    const listings = await request.get(`${API_URL}/api/game/listings`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    expect(listings.ok()).toBe(true);
    const listed = (await listings.json()).data as Array<{ id: string }>;
    expect(listed.map((g) => g.id)).not.toContain(game.id);

    // The id, handed over. It is still not a key.
    const byId = await request.post(`${API_URL}/api/game/joinById`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
      data: { id: game.id },
    });
    expect(byId.status()).toBe(403);

    // ...and the invite code still is.
    const byCode = await request.post(`${API_URL}/api/game/joinByCode`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
      data: { alias: game.alias },
    });
    expect(byCode.ok()).toBe(true);
  });

  test("cancelling the create dialog creates nothing", async ({ page }) => {
    const user = await createUser("canceller");
    await authenticate(page, user);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "New table" }).click();
    await page.getByPlaceholder("Enter game name...").fill("e2e_never_created");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("heading", { name: "New table" })).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "e2e_never_created" })).toBeHidden();
  });
});
