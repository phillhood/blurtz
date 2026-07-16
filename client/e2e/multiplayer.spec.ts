import { test, expect, type Page } from "@playwright/test";
import { API_URL } from "./fixtures/env";
import { createUser } from "./fixtures/users";
import {
  emptyBlurtzPile,
  readGameRow,
  readyButton,
  readyUp,
  readyUpAndStart,
  rosterCard,
  seatPlayers,
  setBankPileCount,
  statusHeading,
  type SeatedTable,
} from "./fixtures/game";

/**
 * Three and four players, in three and four browsers.
 *
 * Both sides have carried a player cap of 4 and a work-pile count that shrinks
 * as the table grows, but every other spec here seats exactly two - so none of
 * it had ever run. What is asserted is what each of the four browsers shows.
 */

/** The work piles of one player area, as rendered. */
function workPiles(page: Page) {
  return page.locator(".work-piles");
}

/**
 * Put the host one click from calling Blurtz. The database edit is invisible
 * until something broadcasts, so the host reloads and the server answers with
 * freshly-read state; the BLURTZ! button renders behind an empty blurtz pile,
 * so waiting for it is waiting for that round trip.
 */
async function armBlurtz(table: SeatedTable, bankPileCount: number): Promise<void> {
  const host = table.players[0];

  await emptyBlurtzPile(table.game.id, host.user.id);
  await setBankPileCount(table.game.id, host.user.id, bankPileCount);
  await host.page.reload();

  await expect(host.page.getByRole("button", { name: "BLURTZ!" })).toBeVisible();
}

test.describe("Four players", () => {
  test("the lobby counts players against the game's own size", async ({
    browser,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 3, maxPlayers: 4 });

    // Both counters, because they are fed from different places and only one of
    // them was ever right: the heading takes maxPlayers off game state, the
    // roster used to say "/2" whatever the game was.
    for (const page of table.pages) {
      await expect(
        page.getByRole("heading", { name: "Waiting for players... (3/4)" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Players (3/4)" })
      ).toBeVisible();
    }

    await table.close();
  });

  test("four players fill a lobby and each sees the other three", async ({
    browser,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 4 });

    for (const { page } of table.players) {
      for (const { user } of table.players) {
        await expect(rosterCard(page, user.username)).toBeVisible();
      }
      await expect(
        page.getByRole("heading", { name: "Players (4/4)" })
      ).toBeVisible();
      await expect(
        page.getByText("Waiting for all players to be ready (0/4)")
      ).toBeVisible();
    }

    await table.close();
  });

  /**
   * Asserted against the API, not the UI: `Dashboard.handleJoinGame` swallows a
   * refused join into a `console.error`, so a UI-only test would pass just as
   * happily against a server that seated a fifth player. The refusal is the
   * server's job and this asks the server for it.
   */
  test("a fifth player is refused from a full game", async ({
    browser,
    request,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 4 });
    const fifth = await createUser("fifth");

    const response = await request.post(`${API_URL}/api/game/joinByCode`, {
      headers: { Authorization: `Bearer ${fifth.token}` },
      data: { alias: table.game.alias },
    });

    expect(response.status(), await response.text()).toBe(400);
    expect((await response.json()).message).toEqual("Game is full");

    // ...and the table did not gain a player anyway.
    for (const page of table.pages) {
      await expect(
        page.getByRole("heading", { name: "Players (4/4)" })
      ).toBeVisible();
    }

    await table.close();
  });

  test("all four boards deal, with three work piles each and three opponents", async ({
    browser,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 4 });

    await readyUpAndStart(table);

    for (const { page, user } of table.players) {
      await expect(page.getByText("Round 1")).toBeVisible();

      // Four player areas - the three opponents across the top, and yourself.
      await expect(workPiles(page)).toHaveCount(4);
      await expect(page.locator(".opponents-row .work-piles")).toHaveCount(3);

      // Three work piles each: WORK_PILE_MAPPING's whole job, on screen.
      for (let area = 0; area < 4; area++) {
        await expect(workPiles(page).nth(area).locator("> div")).toHaveCount(3);
      }

      // Everyone else, by name, and nobody's own name among them.
      const opponents = table.players.filter((other) => other.user.id !== user.id);
      for (const opponent of opponents) {
        await expect(
          page.locator(".opponents-row").getByText(opponent.user.username)
        ).toBeVisible();
      }
      await expect(
        page.locator(".opponents-row").getByText(user.username)
      ).toHaveCount(0);
    }

    await table.close();
  });

  test("a round ends with all four scored, and the last ready-up deals the next", async ({
    browser,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 4 });
    const [host, ...guests] = table.players;

    await readyUpAndStart(table);

    // The host banks 6; nobody else banks anything and each is caught with all
    // ten blurtz cards, which is 0 - 2*10 = -20. Nobody is near 100, so this
    // ends the ROUND.
    await armBlurtz(table, 6);
    await host.page.getByRole("button", { name: "BLURTZ!" }).click();

    for (const page of table.pages) {
      await expect(statusHeading(page)).toHaveText("Round over!");

      // Four scored players and the header, on every one of the four screens.
      await expect(page.getByRole("row")).toHaveCount(5);
      await expect(
        page.getByRole("row").filter({ hasText: host.user.username })
      ).toContainText("+6");
      for (const guest of guests) {
        await expect(
          page.getByRole("row").filter({ hasText: guest.user.username })
        ).toContainText("-20");
      }

      await expect(
        page.getByText("Waiting for all players to be ready (0/4)")
      ).toBeVisible();
    }

    expect(await readGameRow(table.game.id)).toMatchObject({
      status: "round_over",
      currentRound: 1,
    });

    // The last ready-up is what deals, so that page never renders its own
    // "Cancel Ready" - hence the direct click, where `readyUp` would hang.
    for (const page of table.pages.slice(0, -1)) {
      await readyUp(page);
    }
    await readyButton(table.pages[3]).click();

    // Round 2 deals with no button pressed, on all four boards.
    for (const page of table.pages) {
      await expect(statusHeading(page)).toHaveText("Game in progress!");
      await expect(page.getByText("Round 2")).toBeVisible();
      await expect(page.getByText("Score: 0")).toHaveCount(4);
    }

    expect(await readGameRow(table.game.id)).toMatchObject({
      status: "playing",
      currentRound: 2,
    });

    await table.close();
  });

  /**
   * Three opponents are wider than the board they sit in, and a flex row keeps
   * its automatic minimum unless told not to - so the row grew past GameBoard's
   * max-width and scrolled the whole PAGE sideways. The row may scroll within
   * itself; the page may not, in a game where everyone plays at once.
   *
   * Only the horizontal axis: the board is taller than the viewport at two
   * players just as much as at four, which is the board's design and not this
   * row's doing.
   */
  test("a full table does not scroll the page sideways", async ({ browser }) => {
    const table = await seatPlayers(browser, { playerCount: 4 });

    await readyUpAndStart(table);

    for (const page of table.pages) {
      const layout = await page.evaluate(() => ({
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        rowWidth: document.querySelector(".opponents-row")!.clientWidth,
        boardWidth: document.querySelector(".opponents-row")!.parentElement!
          .clientWidth,
      }));

      expect(layout.pageOverflow).toBeLessThanOrEqual(0);
      // Contained by the board it sits in, rather than stretching it.
      expect(layout.rowWidth).toBeLessThanOrEqual(layout.boardWidth);
    }

    await table.close();
  });

  /**
   * The four-player finish. `updateGameStats` writes a row per player on the
   * way to `finished` and had only ever done so for two, and the target score
   * is set through the create modal so a game genuinely ends in one round.
   */
  test("a four-player game can be won in a single round", async ({ browser }) => {
    const table = await seatPlayers(browser, { playerCount: 4, targetScore: 25 });
    const [host] = table.players;

    expect(await readGameRow(table.game.id)).toMatchObject({ targetScore: 25 });

    await readyUpAndStart(table);
    await expect(host.page.getByText("Playing to 25")).toBeVisible();

    await armBlurtz(table, 26);
    await host.page.getByRole("button", { name: "BLURTZ!" }).click();

    for (const page of table.pages) {
      await expect(statusHeading(page)).toContainText("Game finished!");
      await expect(statusHeading(page)).toContainText(
        `Winner: ${host.user.username}`
      );
    }

    expect(await readGameRow(table.game.id)).toMatchObject({ status: "finished" });

    await table.close();
  });
});

test.describe("Three players", () => {
  test("three players deal four work piles each and see two opponents", async ({
    browser,
  }) => {
    const table = await seatPlayers(browser, { playerCount: 3 });

    await readyUpAndStart(table);

    for (const page of table.pages) {
      await expect(workPiles(page)).toHaveCount(3);
      await expect(page.locator(".opponents-row .work-piles")).toHaveCount(2);

      for (let area = 0; area < 3; area++) {
        await expect(workPiles(page).nth(area).locator("> div")).toHaveCount(4);
      }
    }

    await table.close();
  });
});
