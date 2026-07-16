import { test, expect } from "@playwright/test";
import { readyUpAndStart, seatTwoPlayers } from "./fixtures/game";
import { findCards, recordSocketFrames, type SocketRecorder } from "./fixtures/socket";

/**
 * A client must not be sent a card it is not allowed to see.
 *
 * This is the most valuable assertion in the suite, because it is the one bug
 * that is invisible in the UI by construction: the client draws a card back
 * over whatever it was sent, so a server leaking every opponent's whole deal
 * looks EXACTLY like a correct one on screen. Screenshots cannot see it. The
 * only place the truth is legible is the frame on the wire.
 *
 * So this reads the frames. `shared/src/rules/redact.spec.ts` already pins the
 * pure function; what this adds is that the function is actually reached on
 * every path out of the real server - which is a wiring claim, and wiring is
 * what e2e is for.
 */
test.describe("Redaction", () => {
  /**
   * A face-down card on the wire must be `{ id, faceUp: false }` and nothing
   * else - not a nulled-out value, but no value field at all - and its id must
   * be the synthetic positional one, never the card's real id.
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

      // The assertion above is only worth something if there were face-down
      // cards to leak. A 2-player deal gives each player 9 buried blurtz cards
      // and a 25-card draw pile: 34 each, 68 in the game, in every frame that
      // carries state.
      expect(hidden.length).toBeGreaterThan(60);
      // ...and only worth something if face-up cards DO come through with
      // their values, or "redaction" could just be an empty payload.
      expect(visible.length).toBeGreaterThan(0);
      for (const { card } of visible) {
        expect(card).toHaveProperty("value");
        expect(card).toHaveProperty("color");
      }
    }

    await seated.close();
  });

  /**
   * The deal itself, read off the wire.
   *
   * The DOM cannot answer this: the blurtz pile renders at most 3 of its cards
   * and the draw pile 2, so "10 cards, one of them face-up" is simply not on
   * screen. It is on the wire, and it is the difference between a correct deal
   * and a plausible-looking one.
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
