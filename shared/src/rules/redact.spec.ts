import { Card, GameState, Pile, PlayerDeck } from "../types";
import { CARD_COLORS } from "../constants";
import { dealCards } from "./engine";
import { ClientCard, ClientPile, toClientGameState } from "./redact";

/**
 * The last group is the one that matters: it serialises the payload and greps
 * it, because a string in a socket frame is what an attacker actually gets.
 */

const { RED, BLUE, GREEN } = CARD_COLORS;

function card(id: string, value: number, faceUp: boolean, color = RED): Card {
  return { id, value, color, faceUp };
}

function pile(id: string, type: Pile["type"], cards: Card[] = []): Pile {
  return { id, type, cards };
}

/** Every card object anywhere in a redacted payload. */
function allCards(state: {
  players: Array<{ deck: { blurtzPile: ClientPile; workPiles: ClientPile[]; drawPile: ClientPile } }>;
  bankPiles: ClientPile[];
}): ClientCard[] {
  const piles: ClientPile[] = [
    ...state.bankPiles,
    ...state.players.flatMap((p) =>
      p.deck ? [p.deck.blurtzPile, p.deck.drawPile, ...p.deck.workPiles] : []
    ),
  ];
  return piles.flatMap((p) => p.cards);
}

/** A two-player game state with a deck of the given shape for each player. */
function gameState(decks: PlayerDeck[], bankPiles: Pile[] = []): GameState {
  return {
    id: "game-1",
    name: "Test game",
    alias: "test-game",
    maxPlayers: 2,
    currentPlayers: decks.length,
    status: "playing",
    hostId: "user-1",
    hostUsername: "player1",
    createdAt: new Date(),
    players: decks.map((deck, index) => ({
      id: `player-${index + 1}`,
      username: `player${index + 1}`,
      user: { id: `user-${index + 1}`, username: `player${index + 1}` } as never,
      isReady: true,
      deck,
      score: 0,
      roundScore: 0,
      bankPileCount: 0,
    })),
    bankPiles,
    // 1-based: a game is in round 1 from the moment it exists.
    currentRound: 1,
    targetScore: 100,
    winner: null,
  };
}

function deck(
  prefix: string,
  overrides: Partial<PlayerDeck> = {}
): PlayerDeck {
  return {
    blurtzPile: pile(`${prefix}-blurtz`, "blurtz", [
      card(`${prefix}-b0`, 7, false),
      card(`${prefix}-b1`, 3, true),
    ]),
    workPiles: [pile(`${prefix}-work-0`, "work", [card(`${prefix}-w0`, 9, true)])],
    drawPile: pile(`${prefix}-draw`, "draw", [
      card(`${prefix}-d0`, 4, false),
      card(`${prefix}-d1`, 5, true),
    ]),
    ...overrides,
  };
}

describe("redaction", () => {
  describe("face-down cards", () => {
    it("emits ONLY id and faceUp - no value, number, color or ownerId", () => {
      // Deliberately carries `number` and `ownerId`, which are not on `Card`:
      // redaction is a whitelist, so a card holding fields the type does not
      // know about is what proves it cannot leak them. Not hypothetical - old
      // deck blobs in the JSON column still have them.
      const hidden = {
        id: "real-id",
        value: 7,
        number: 7,
        color: BLUE,
        faceUp: false,
        ownerId: "player-1",
      } as Card;
      const state = gameState([
        deck("p1", { drawPile: pile("p1-draw", "draw", [hidden]) }),
      ]);

      const [redacted] = toClientGameState(state).players[0].deck.drawPile.cards;

      expect(Object.keys(redacted).sort()).toEqual(["faceUp", "id"]);
      expect(redacted.faceUp).toBe(false);
      expect(redacted).not.toHaveProperty("value");
      expect(redacted).not.toHaveProperty("number");
      expect(redacted).not.toHaveProperty("color");
      expect(redacted).not.toHaveProperty("ownerId");
    });

    it("hides face-down cards in ALL FOUR pile kinds", () => {
      // Bank piles never hold a face-down card in a real game, but redaction
      // must not depend on that - it is the last thing between the deal and the
      // wire.
      const state = gameState(
        [
          deck("p1", {
            blurtzPile: pile("p1-blurtz", "blurtz", [card("p1-b0", 1, false)]),
            workPiles: [pile("p1-work-0", "work", [card("p1-w0", 2, false)])],
            drawPile: pile("p1-draw", "draw", [card("p1-d0", 3, false)]),
          }),
        ],
        [pile("bank-0", "bank", [card("bank-c0", 4, false)])]
      );

      const redacted = toClientGameState(state);

      expect(allCards(redacted)).toHaveLength(4);
      for (const c of allCards(redacted)) {
        expect(Object.keys(c).sort()).toEqual(["faceUp", "id"]);
      }
    });
  });

  describe("face-up cards", () => {
    it("passes a face-up card through untouched", () => {
      const visible: Card = {
        id: "visible-id",
        value: 6,
        color: GREEN,
        faceUp: true,
      };
      const state = gameState([
        deck("p1", { workPiles: [pile("p1-work-0", "work", [visible])] }),
      ]);

      const [redacted] =
        toClientGameState(state).players[0].deck.workPiles[0].cards;

      expect(redacted).toEqual(visible);
    });

    it("passes face-up bank pile cards through untouched", () => {
      const banked = card("bank-c0", 1, true, GREEN);
      const state = gameState([deck("p1")], [pile("bank-0", "bank", [banked])]);

      expect(toClientGameState(state).bankPiles[0].cards[0]).toEqual(banked);
    });

    it("keeps the top of a blurtz pile visible and the rest hidden", () => {
      const state = gameState([deck("p1")]);

      const cards = toClientGameState(state).players[0].deck.blurtzPile.cards;

      expect(cards[0].faceUp).toBe(false);
      expect(cards[1]).toEqual(card("p1-b1", 3, true));
    });
  });

  describe("hidden card ids", () => {
    it("never publishes a hidden card's real id", () => {
      const state = gameState([deck("p1")]);

      const [hidden] = toClientGameState(state).players[0].deck.drawPile.cards;

      expect(hidden.id).not.toBe("p1-d0");
    });

    it("derives the id from pile and position, not from the card", () => {
      const state = gameState([
        deck("p1", {
          drawPile: pile("p1-draw", "draw", [
            card("p1-d0", 4, false),
            card("p1-d1", 5, false),
          ]),
        }),
      ]);

      const cards = toClientGameState(state).players[0].deck.drawPile.cards;

      expect(cards.map((c) => c.id)).toEqual([
        "hidden:p1-draw:0",
        "hidden:p1-draw:1",
      ]);
    });

    it("gives the same card the same id twice within one emission", () => {
      const state = gameState([deck("p1")]);

      const first = toClientGameState(state);
      const second = toClientGameState(state);

      expect(first.players[0].deck.drawPile.cards[0].id).toBe(
        second.players[0].deck.drawPile.cards[0].id
      );
    });

    it("is unique across the whole payload - React keys must not collide", () => {
      const state = gameState([deck("p1"), deck("p2")], [
        pile("bank-0", "bank", [card("bank-c0", 1, false)]),
      ]);

      const ids = allCards(toClientGameState(state)).map((c) => c.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it("does not reuse an id a card was seen under while it was face-up", () => {
      // The reset case: `flipDrawPile` turns cards face-down AGAIN. A client
      // that recorded id -> value while they were visible must not be able to
      // recognise them afterwards.
      const seen = gameState([
        deck("p1", { drawPile: pile("p1-draw", "draw", [card("p1-d0", 4, true)]) }),
      ]);
      const reset = gameState([
        deck("p1", { drawPile: pile("p1-draw", "draw", [card("p1-d0", 4, false)]) }),
      ]);

      const visibleId = toClientGameState(seen).players[0].deck.drawPile.cards[0]
        .id;
      const hiddenId = toClientGameState(reset).players[0].deck.drawPile.cards[0]
        .id;

      expect(visibleId).toBe("p1-d0");
      expect(hiddenId).not.toBe(visibleId);
    });
  });

  describe("non-card state", () => {
    it("carries ids, names, scores and status through unchanged", () => {
      const state = gameState([deck("p1")]);

      const redacted = toClientGameState(state);

      expect(redacted.id).toBe("game-1");
      expect(redacted.alias).toBe("test-game");
      expect(redacted.status).toBe("playing");
      expect(redacted.hostId).toBe("user-1");
      expect(redacted.players[0].username).toBe("player1");
      expect(redacted.players[0].bankPileCount).toBe(0);
      expect(redacted.maxPlayers).toBe(2);
    });

    it("does not mutate the state it is handed", () => {
      const state = gameState([deck("p1")]);
      const before = JSON.stringify(state);

      toClientGameState(state);

      expect(JSON.stringify(state)).toBe(before);
    });

    it("survives a player whose deck has not been dealt yet", () => {
      // Every lobby broadcast is this shape: `joinGame` writes `deck: null`.
      const state = gameState([null as unknown as PlayerDeck]);

      expect(() => toClientGameState(state)).not.toThrow();
      expect(toClientGameState(state).players[0].deck).toBeNull();
    });
  });

  describe("a real deal, serialised", () => {
    /** A deterministic deal, so a failure is reproducible. */
    function seededRng(seed: number): () => number {
      let value = seed;
      return () => {
        value = (value * 1664525 + 1013904223) % 4294967296;
        return value / 4294967296;
      };
    }

    function faceDownCards(d: PlayerDeck): Card[] {
      return [
        ...d.blurtzPile.cards,
        ...d.drawPile.cards,
        ...d.workPiles.flatMap((p) => p.cards),
      ].filter((c) => !c.faceUp);
    }

    it("leaks no face-down card's real id into the payload", () => {
      const decks = [dealCards(2, seededRng(1)), dealCards(2, seededRng(2))];
      const state = gameState(decks);

      const payload = JSON.stringify(toClientGameState(state));

      const hidden = decks.flatMap(faceDownCards);
      // 2 players x (9 buried blurtz + 25 draw) - the deal is not a fixture,
      // so assert it really is full before trusting the grep below.
      expect(hidden.length).toBe(68);
      for (const c of hidden) {
        expect(payload).not.toContain(c.id);
      }
    });

    it("leaks no face-down card's value or colour into the payload", () => {
      // A string grep cannot work here: a hidden card's value is a digit 1-10
      // and its colour one of four names, all of which legitimately appear on
      // face-up cards. So the check is structural - nothing marked
      // `faceUp: false` may carry a value or colour at all.
      const decks = [dealCards(2, seededRng(3)), dealCards(2, seededRng(4))];
      const state = gameState(decks);

      const payload = JSON.parse(JSON.stringify(toClientGameState(state)));

      const hiddenInPayload = allCards(payload).filter((c) => !c.faceUp);
      expect(hiddenInPayload.length).toBe(68);
      for (const c of hiddenInPayload) {
        expect(Object.keys(c).sort()).toEqual(["faceUp", "id"]);
      }
    });

    it("keeps every face-up card readable - the client still has a game", () => {
      const decks = [dealCards(2, seededRng(5))];
      const state = gameState(decks);

      const payload = JSON.parse(JSON.stringify(toClientGameState(state)));

      const visible = allCards(payload).filter((c) => c.faceUp);
      // The blurtz pile's top card + one on each of the five work piles a
      // two-player deal gets.
      expect(visible.length).toBe(6);
      for (const c of visible) {
        expect(c).toHaveProperty("value");
        expect(c).toHaveProperty("color");
      }
    });
  });
});
