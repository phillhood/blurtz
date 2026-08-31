import { test, expect, type Page } from "@playwright/test";
import {
  seatPlayers,
  readyUpAndStart,
  startEveryBankPile,
} from "./fixtures/game";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    // Overflowing is only a defect when the box actually hides it. A zone with
    // `overflow: visible` spills and the page scrolls; a zone with hidden, auto
    // or scroll cuts cards in half, which is the failure this gate exists for.
    const clipped = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-testid='opponents-row'], [data-testid='bank-piles'], [data-testid='center-area']"
      )
    )
      .filter((el) => {
        if (el.scrollHeight <= el.clientHeight + 1) return false;
        const overflowY = getComputedStyle(el).overflowY;
        return overflowY !== "visible";
      })
      .map((el) => el.dataset.testid);
    return {
      pageScrollsSideways: doc.scrollWidth > window.innerWidth + 1,
      clipped,
      // Count the SLOTS, not the cards: a pile renders stacked backs behind
      // its top card, and every one of those is foundation-sized too.
      foundations: document.querySelectorAll(
        "[data-testid='bank-piles'] .blurtz-slot"
      ).length,
    };
  });
}

test("the board fits every viewport at full density", async ({ browser }) => {
  test.setTimeout(180_000);
  const seated = await seatPlayers(browser, { playerCount: 4 });
  await readyUpAndStart(seated);
  await startEveryBankPile(seated.game.id);

  const page = seated.players[0].page;
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "Game in progress!"
  );

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.waitForTimeout(400);
    const result = await measure(page);

    expect(result.pageScrollsSideways, `${viewport.name} scrolls sideways`).toBe(
      false
    );
    expect(result.clipped, `${viewport.name} clips a zone`).toEqual([]);
    expect(result.foundations, `${viewport.name} hides foundations`).toBe(16);
  }

  await seated.close();
});
