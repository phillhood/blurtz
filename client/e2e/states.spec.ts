import { test, expect } from "@playwright/test";
import { seatPlayers, readyUpAndStart, startEveryBankPile } from "./fixtures/game";
import { withDb } from "./fixtures/db";

test("a completed foundation reads as inert", async ({ browser }) => {
  test.setTimeout(180_000);
  const seated = await seatPlayers(browser, { playerCount: 2 });
  await readyUpAndStart(seated);
  await startEveryBankPile(seated.game.id);

  // Finish one foundation. Nothing can ever be played on it again.
  await withDb(async (db) => {
    const { rows } = await db.query(`SELECT game_state FROM games WHERE id = $1`, [
      seated.game.id,
    ]);
    const state = rows[0].game_state as {
      bankPiles: Array<{ cards: Array<Record<string, unknown>> }>;
    };
    const top = state.bankPiles[0].cards[0] as Record<string, unknown>;
    state.bankPiles[0].cards = [{ ...top, id: "done-10", value: 10 }];
    await db.query(`UPDATE games SET game_state = $1 WHERE id = $2`, [
      state,
      seated.game.id,
    ]);
  });

  const page = seated.players[0].page;
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Game in progress!");

  const complete = page.locator("[data-complete='true']");
  await expect(complete).toHaveCount(1);
  // Desaturated, not merely labelled: the board shows where the game still is.
  await expect(complete).toHaveCSS("filter", /saturate/);

  await seated.close();
});
