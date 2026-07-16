import { test, expect } from "@playwright/test";
import { readyUpAndStart, seatPlayers, seatTwoPlayers } from "./fixtures/game";
import { findCards, recordSocketFrames, type SocketRecorder } from "./fixtures/socket";

/**
 * A client must not be sent a card it is not allowed to see.
 *
 * Asserted on the wire, not the DOM: the client draws a card back over whatever
 * it was sent, so a server leaking every opponent's deal looks EXACTLY like a
 * correct one on screen. `shared/src/rules/redact.spec.ts` pins the pure
 * function; this pins that it is actually reached on every path out of the
 * real server.
 */
test.describe("Redaction", () => {
  /**
   * A face-down card on the wire must be `{ id, faceUp: false }` and nothing
   * else - no value field at all, not a nulled-out one - under the synthetic
   * positional id, never the card's real id.
   */
  function assertNoLeaks(recorder: SocketRecorder) {
    const cards = recorder.frames.flatMap((frame) =>
      findCards(frame.args, `${frame.event}`)
    );

    const hidden = cards.filter(({ card }) => card.faceUp === false);
    const visible = cards.filter(({ card }) => card.faceUp === true);

    for (const { path, card } of hidden) {
      expect(
        Object.keys(card).sort(),
        `face-down card at ${path} carries more than its position: ${JSON.stringify(card)}`
      ).toEqual(["faceUp", "id"]);
      expect(
        String(card.id),
        `face-down card at ${path} travelled under a real id`
      ).toMatch(/^hidden:/);
    }

    return { hidden, visible };
  }

  test("no face-down card's value ever reaches a client", async ({ browser }) => {
    const recorders: SocketRecorder[] = [];
    const seated = await seatTwoPlayers(browser, {
      onPageCreated: (page) => recorders.push(recordSocketFrames(page)),
    });

    await readyUpAndStart(seated);

    const [hostRecorder, guestRecorder] = recorders;
    await hostRecorder.waitFor("game_started");
    await guestRecorder.waitFor("game_started");

    for (const recorder of recorders) {
      const { hidden, visible } = assertNoLeaks(recorder);

      // Only worth something if there were face-down cards to leak: a 2-player
      // deal buries 9 blurtz cards and a 25-card draw pile per player, 68 in
      // the game.
      expect(hidden.length).toBeGreaterThan(60);
      // ...and only if face-up cards DO come through with their values, or
      // "redaction" could just be an empty payload.
      expect(visible.length).toBeGreaterThan(0);
      for (const { card } of visible) {
        expect(card).toHaveProperty("value");
        expect(card).toHaveProperty("color");
      }
    }

    await seated.close();
  });

  /**
   * The same claim at a full table. Worth its own test rather than a parameter:
   * four players is three opponents' decks in every payload instead of one, and
   * the redaction is player-INDEPENDENT - the gateway redacts once and
   * broadcasts to the room, so a leak here would be a leak to everyone.
   */
  test("no face-down card's value reaches any of four clients", async ({
    browser,
  }) => {
    const recorders: SocketRecorder[] = [];
    const table = await seatPlayers(browser, {
      playerCount: 4,
      onPageCreated: (page) => recorders.push(recordSocketFrames(page)),
    });

    await readyUpAndStart(table);

    for (const recorder of recorders) {
      await recorder.waitFor("game_started");
    }

    expect(recorders).toHaveLength(4);
    for (const recorder of recorders) {
      const { hidden, visible } = assertNoLeaks(recorder);

      // A 4-player deal buries 9 blurtz cards and a 27-card draw pile per
      // player - 144 in the game, and every one of them in every payload.
      expect(hidden.length).toBeGreaterThan(140);
      expect(visible.length).toBeGreaterThan(0);
      for (const { card } of visible) {
        expect(card).toHaveProperty("value");
        expect(card).toHaveProperty("color");
      }
    }

    await table.close();
  });

  /**
   * Read off the wire because the DOM cannot answer it: the blurtz pile renders
   * at most 3 of its cards and the draw pile 2, so "10 cards, one face-up" is
   * not on screen.
   */
  test("the dealt state on the wire is the deal the rules describe", async ({
    browser,
  }) => {
    let hostRecorder!: SocketRecorder;
    const seated = await seatTwoPlayers(browser, {
      onPageCreated: (page, role) => {
        const recorder = recordSocketFrames(page);
        if (role === "host") hostRecorder = recorder;
      },
    });

    await readyUpAndStart(seated);

    const started = await hostRecorder.waitFor("game_started");
    const state = (started.args[0] as { gameState: GameStatePayload }).gameState;

    expect(state.status).toEqual("playing");
    expect(state.currentRound).toEqual(1);
    expect(state.targetScore).toEqual(100);
    expect(state.players).toHaveLength(2);

    for (const player of state.players) {
      // 10 to the blurtz pile, only the top one face-up.
      expect(player.deck.blurtzPile.cards).toHaveLength(10);
      expect(player.deck.blurtzPile.cards.filter((c) => c.faceUp)).toHaveLength(1);
      expect(player.deck.blurtzPile.cards[9].faceUp).toBe(true);

      // Five work piles at two players, one face-up card each.
      expect(player.deck.workPiles).toHaveLength(5);
      for (const pile of player.deck.workPiles) {
        expect(pile.cards).toHaveLength(1);
        expect(pile.cards[0].faceUp).toBe(true);
      }

      // The rest of the 40-card deck, face-down.
      expect(player.deck.drawPile.cards).toHaveLength(25);
      expect(player.deck.drawPile.cards.every((c) => !c.faceUp)).toBe(true);
    }

    // The foundations start empty and shared.
    expect(state.bankPiles.every((pile) => pile.cards.length === 0)).toBe(true);

    await seated.close();
  });
});

interface WireCard {
  id: string;
  faceUp: boolean;
  value?: number;
}

interface WirePile {
  id: string;
  cards: WireCard[];
}

interface GameStatePayload {
  status: string;
  currentRound: number;
  targetScore: number;
  bankPiles: WirePile[];
  players: Array<{
    deck: { blurtzPile: WirePile; workPiles: WirePile[]; drawPile: WirePile };
  }>;
}
