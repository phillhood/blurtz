import { test, expect } from "@playwright/test";
import { seatPlayers, readyUpAndStart } from "./fixtures/game";
import { withDb } from "./fixtures/db";

/**
 * Arrange a guaranteed-legal tap: read the player's real dealt work piles, take
 * a top card, and seed a bank pile with the value below it in the same colour.
 * The deal is random, so a fixed fixture would only sometimes have a legal move.
 */
async function seedLegalBankTarget(gameId: string, userId: string) {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT deck FROM players WHERE game_id = $1 AND user_id = $2`,
      [gameId, userId]
    );
    const deck = rows[0].deck as {
      workPiles: Array<{ cards: Array<{ id: string; value: number; color: unknown }> }>;
    };
    const pile = deck.workPiles.find((p) => p.cards.length > 0);
    if (!pile) throw new Error("no work pile was dealt");
    const top = pile.cards[pile.cards.length - 1];

    const game = await db.query(`SELECT game_state FROM games WHERE id = $1`, [gameId]);
    const state = game.rows[0].game_state as {
      bankPiles: Array<{ id: string; cards: unknown[] }>;
    };
    state.bankPiles[0].cards = [
      { id: "seed-target", value: top.value - 1, color: top.color, faceUp: true },
    ];
    await db.query(`UPDATE games SET game_state = $1 WHERE id = $2`, [state, gameId]);
    return { cardId: top.id, bankPileId: state.bankPiles[0].id, value: top.value };
  });
}

test("a card can be played by tapping it and then its target", async ({ browser }) => {
  test.setTimeout(180_000);
  const seated = await seatPlayers(browser, { playerCount: 2 });
  await readyUpAndStart(seated);

  const host = seated.players[0];
  const seed = await seedLegalBankTarget(seated.game.id, host.user.id);

  const page = host.page;
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Game in progress!");

  // Own cards are play-sized; opponents are tokens and foundations are
  // foundation-sized, so this cannot pick up someone else's card by accident.
  const source = page
    .locator("[data-card-size='play']")
    .filter({ hasText: new RegExp(`^${seed.value}$`) })
    .first();
  await source.click();
  await expect(source).toHaveAttribute("data-selected", "true");

  // Selecting must light the seeded foundation and nothing illegal.
  const targets = page.locator("[data-legal-target='true']");
  await expect(targets.first()).toBeVisible();

  await targets.first().click();

  // The server is the judge: the card really left the work pile.
  await expect
    .poll(async () =>
      withDb(async (db) => {
        const { rows } = await db.query(
          `SELECT deck FROM players WHERE game_id = $1 AND user_id = $2`,
          [seated.game.id, host.user.id]
        );
        const deck = rows[0].deck as { workPiles: Array<{ cards: Array<{ id: string }> }> };
        return deck.workPiles.some((p) => p.cards.some((c) => c.id === seed.cardId));
      })
    , { timeout: 10_000 })
    .toBe(false);

  await seated.close();
});
