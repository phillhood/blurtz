import { Card, Pile, PlayerDeck } from "../types";
import { CARD_COLORS } from "../constants";
import {
  BoardState,
  canMoveFromPile,
  canPlace,
  cardsMovedBy,
  dealCards,
  executeMove,
  flipDrawPile,
  scoreRound,
  validateMove,
} from "./engine";

/**
 * The rules engine's tests.
 *
 * These are pure-function tests: no Prisma, no Nest, no database, no mocks.
 * That is the point - the engine is being tested at the layer it will be
 * shared from, and the specs are meant to survive the move to a shared package
 * with the client largely untouched.
 */

const { RED, BLUE, YELLOW, GREEN } = CARD_COLORS;

/**
 * A card, with a readable id.
 *
 * Ids are "R1"/"B3" rather than UUIDs on purpose: nothing in the engine parses
 * an id, and a failure that says `["B3", "Y2"]` beats one that says
 * `["bbbbbbbb-bbbb-4bbb-...", ...]`. The UUID shape is a database-boundary
 * concern, policed by PlayerDeckSchema and exercised in game.service.spec.ts.
 */
function card(
  id: string,
  value: number,
  color = RED,
  faceUp = true
): Card {
  return { id, value, number: value, color, faceUp };
}

function pile(id: string, type: Pile["type"], cards: Card[] = []): Pile {
  return { id, type, cards };
}

/**
 * A board whose `bankPiles` is known to be there.
 *
 * `BoardState` leaves `bankPiles` optional because the engine reads it out of
 * a JSON column, where an old or half-written row genuinely can arrive without
 * one - and the engine tolerates that on purpose. A test that just built the
 * board three lines up knows better. Saying so once here beats an `!` on every
 * assertion below, and it does not weaken anything: the engine is still
 * exercised through its real, tolerant signature.
 */
type TestBoard = BoardState & { bankPiles: Pile[] };

describe("rules engine", () => {
  // =====================================================================
  // canPlace - WORK piles
  // =====================================================================
  describe("canPlace: work piles", () => {
    it("accepts ANY card on an empty work pile", () => {
      expect(canPlace("work", undefined, card("R1", 1, RED))).toBe(true);
      expect(canPlace("work", undefined, card("B5", 5, BLUE))).toBe(true);
      expect(canPlace("work", undefined, card("Y9", 9, YELLOW))).toBe(true);
      expect(canPlace("work", undefined, card("G10", 10, GREEN))).toBe(true);
    });

    // Two contradictory rules exist in this codebase: the dead client copy at
    // client/src/utils/constants.utils.ts requires `value === 10` to start a
    // work pile, while the server has always allowed any card. This test
    // records which one is real - the server's. A shared rules package must
    // adopt THIS behaviour, not the client's.
    it("does NOT restrict an empty work pile to 10s", () => {
      expect(canPlace("work", undefined, card("R1", 1, RED))).toBe(true);
      expect(canPlace("work", undefined, card("B4", 4, BLUE))).toBe(true);
      expect(canPlace("work", null, card("Y7", 7, YELLOW))).toBe(true);
    });

    it("accepts a card one lower of the opposite colour type", () => {
      // Blue is type "a", yellow is type "b".
      expect(canPlace("work", card("B5", 5, BLUE), card("Y4", 4, YELLOW))).toBe(
        true
      );
      // Green is type "b", red is type "a".
      expect(canPlace("work", card("G8", 8, GREEN), card("R7", 7, RED))).toBe(
        true
      );
    });

    it("rejects a card of the SAME colour type, even at the right value", () => {
      // Red and blue are both type "a" - different names, same type.
      expect(canPlace("work", card("B5", 5, BLUE), card("R4", 4, RED))).toBe(
        false
      );
      // Yellow and green are both type "b".
      expect(canPlace("work", card("Y6", 6, YELLOW), card("G5", 5, GREEN))).toBe(
        false
      );
      // Same colour outright.
      expect(canPlace("work", card("R5", 5, RED), card("R4", 4, RED))).toBe(
        false
      );
    });

    it("alternates on colour TYPE, not colour name", () => {
      // The crux of the asymmetry with bank piles: two different-named cards
      // of the same type cannot stack, and this is the rule that says so.
      const blueFive = card("B5", 5, BLUE);
      expect(canPlace("work", blueFive, card("R4", 4, RED))).toBe(false);
      expect(canPlace("work", blueFive, card("Y4", 4, YELLOW))).toBe(true);
      expect(canPlace("work", blueFive, card("G4", 4, GREEN))).toBe(true);
    });

    it("rejects a wrong value, even with the right alternation", () => {
      const blueFive = card("B5", 5, BLUE);
      expect(canPlace("work", blueFive, card("Y6", 6, YELLOW))).toBe(false); // ascending
      expect(canPlace("work", blueFive, card("Y5", 5, YELLOW))).toBe(false); // equal
      expect(canPlace("work", blueFive, card("Y3", 3, YELLOW))).toBe(false); // two lower
      expect(canPlace("work", blueFive, card("Y1", 1, YELLOW))).toBe(false);
    });
  });

  // =====================================================================
  // canPlace - BANK piles
  // =====================================================================
  describe("canPlace: bank piles", () => {
    it("accepts ONLY a 1 on an empty bank pile", () => {
      expect(canPlace("bank", undefined, card("R1", 1, RED))).toBe(true);
      expect(canPlace("bank", undefined, card("G1", 1, GREEN))).toBe(true);

      for (const value of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        expect(canPlace("bank", undefined, card(`R${value}`, value, RED))).toBe(
          false
        );
      }
    });

    it("accepts the next value up in the same colour", () => {
      expect(canPlace("bank", card("R1", 1, RED), card("R2", 2, RED))).toBe(
        true
      );
      expect(canPlace("bank", card("G6", 6, GREEN), card("G7", 7, GREEN))).toBe(
        true
      );
    });

    it("rejects a different colour NAME, even of the same colour type", () => {
      // Red and blue are both type "a". Bank piles match on name, so this is
      // rejected where a work pile would care about the type instead.
      expect(canPlace("bank", card("R1", 1, RED), card("B2", 2, BLUE))).toBe(
        false
      );
      // Yellow and green are both type "b".
      expect(canPlace("bank", card("Y3", 3, YELLOW), card("G4", 4, GREEN))).toBe(
        false
      );
    });

    it("rejects a wrong value in the right colour", () => {
      const redFive = card("R5", 5, RED);
      expect(canPlace("bank", redFive, card("R4", 4, RED))).toBe(false); // descending
      expect(canPlace("bank", redFive, card("R5b", 5, RED))).toBe(false); // equal
      expect(canPlace("bank", redFive, card("R7", 7, RED))).toBe(false); // skips one
      expect(canPlace("bank", redFive, card("R1", 1, RED))).toBe(false);
    });

    // This is the test that licenses the absence of any "clear a bank pile at
    // 10" logic. A completed pile is ALREADY inert: the ascending rule can only
    // ever accept an 11, and no such card exists. Nothing needs to recycle it,
    // and BANK_PILE_COUNT: 16 is correct precisely because piles are never
    // reused - 16 is the number of 1s in play (4 colours x 4 players).
    it("is inert once complete: nothing can be played on a finished 1-10 pile", () => {
      const redTen = card("R10", 10, RED);

      // No real card can follow a 10 - the whole 1-10 range, in every colour.
      for (const color of [RED, BLUE, YELLOW, GREEN]) {
        for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          expect(
            canPlace("bank", redTen, card(`x${value}`, value, color))
          ).toBe(false);
        }
      }
    });

    it("rejects an 11th card on a full 1-10 pile", () => {
      // An 11 is the only thing the rule would accept on a 10 - and it does not
      // exist in the deck. Constructed here purely to prove the pile's
      // inertness comes from the deck's range, not from a special case.
      const redTen = card("R10", 10, RED);
      const redEleven = card("R11", 11, RED);

      // Sanity: the rule really is "top + 1, same name" and nothing more.
      expect(redEleven.value).toBe(redTen.value + 1);
      expect(redEleven.color.name).toBe(redTen.color.name);

      // ...and yet dealCards never mints one, so a full pile stays inert.
      const dealt = dealCards(4);
      const allValues = [
        ...dealt.blurtzPile.cards,
        ...dealt.workPiles.flatMap((p) => p.cards),
        ...dealt.drawPile.cards,
      ].map((c) => c.value);
      expect(Math.max(...allValues)).toBe(10);
      expect(allValues).not.toContain(11);
    });
  });

  // =====================================================================
  // canPlace - piles that are never destinations
  // =====================================================================
  describe("canPlace: non-destination piles", () => {
    it("never accepts a card onto a blurtz or draw pile", () => {
      expect(canPlace("blurtz", undefined, card("R1", 1, RED))).toBe(false);
      expect(canPlace("blurtz", card("R2", 2, RED), card("R1", 1, RED))).toBe(
        false
      );
      expect(canPlace("draw", undefined, card("R1", 1, RED))).toBe(false);
      expect(canPlace("draw", card("R2", 2, RED), card("R1", 1, RED))).toBe(
        false
      );
    });
  });

  // =====================================================================
  // cardsMovedBy - how far does a move reach?
  // =====================================================================
  describe("cardsMovedBy", () => {
    const bottom = card("R1", 1, RED);
    const middle = card("B9", 9, BLUE);
    const top = card("Y2", 2, YELLOW);
    const stack = () => [bottom, middle, top];

    // THE regression test for the corruption bug. A work→bank move takes one
    // card and one card only. When it took the whole stack, a single play to a
    // foundation swept an entire tableau pile onto it.
    //
    // Asked as a counterfactual: `cardsMovedBy` answers "how far would this
    // reach", not "is this allowed" - that is `canMoveFromPile`'s job, and it
    // rejects this exact move (see below). The buried card is used here because
    // it is the ONLY input that can tell the two branches apart.
    it("moves exactly ONE card work→bank, even from the bottom of a stack", () => {
      expect(cardsMovedBy("work", "bank", stack(), "R1")).toEqual([bottom]);
      expect(cardsMovedBy("work", "bank", stack(), "B9")).toEqual([middle]);
      expect(cardsMovedBy("work", "bank", stack(), "Y2")).toEqual([top]);
    });

    it("moves the card AND everything above it work→work", () => {
      expect(cardsMovedBy("work", "work", stack(), "R1")).toEqual([
        bottom,
        middle,
        top,
      ]);
      expect(cardsMovedBy("work", "work", stack(), "B9")).toEqual([middle, top]);
      // The top card carries nothing with it - a stack of one.
      expect(cardsMovedBy("work", "work", stack(), "Y2")).toEqual([top]);
    });

    it("moves exactly one card from a blurtz source, whatever the destination", () => {
      const cards = [card("G5", 5, GREEN, false), card("R1", 1, RED)];
      expect(cardsMovedBy("blurtz", "bank", cards, "R1")).toEqual([cards[1]]);
      expect(cardsMovedBy("blurtz", "work", cards, "R1")).toEqual([cards[1]]);
    });

    it("moves exactly one card from a draw source, whatever the destination", () => {
      const cards = [card("G5", 5, GREEN), card("R1", 1, RED)];
      expect(cardsMovedBy("draw", "bank", cards, "R1")).toEqual([cards[1]]);
      expect(cardsMovedBy("draw", "work", cards, "R1")).toEqual([cards[1]]);
    });

    it("moves nothing when the card is not in the pile", () => {
      expect(cardsMovedBy("work", "work", stack(), "nope")).toEqual([]);
      expect(cardsMovedBy("work", "bank", stack(), "nope")).toEqual([]);
    });

    it("does not mutate the pile it is asked about", () => {
      const cards = stack();
      cardsMovedBy("work", "work", cards, "R1");
      cardsMovedBy("work", "bank", cards, "R1");
      expect(cards.map((c) => c.id)).toEqual(["R1", "B9", "Y2"]);
    });
  });

  // =====================================================================
  // canMoveFromPile - is the card takeable at all?
  // =====================================================================
  describe("canMoveFromPile", () => {
    describe("draw piles", () => {
      // [face-down stock at the front][face-up waste at the end]
      const drawCards = () => [
        card("G7", 7, GREEN, false),
        card("G8", 8, GREEN, false),
        card("R1", 1, RED, true),
        card("B2", 2, BLUE, true),
        card("Y3", 3, YELLOW, true), // last face-up: the only playable card
      ];

      it("allows only the LAST face-up card", () => {
        expect(canMoveFromPile("draw", "bank", drawCards(), "Y3")).toBe(true);
        expect(canMoveFromPile("draw", "work", drawCards(), "Y3")).toBe(true);
      });

      it("rejects an earlier face-up card", () => {
        expect(canMoveFromPile("draw", "work", drawCards(), "R1")).toBe(false);
        expect(canMoveFromPile("draw", "work", drawCards(), "B2")).toBe(false);
      });

      it("rejects a face-down card", () => {
        expect(canMoveFromPile("draw", "work", drawCards(), "G7")).toBe(false);
        expect(canMoveFromPile("draw", "work", drawCards(), "G8")).toBe(false);
      });

      it("rejects a card that is not in the pile", () => {
        expect(canMoveFromPile("draw", "work", drawCards(), "nope")).toBe(false);
      });
    });

    describe("blurtz piles", () => {
      const blurtzCards = () => [
        card("G5", 5, GREEN, false),
        card("B4", 4, BLUE, false),
        card("R1", 1, RED, true), // top: the only playable card
      ];

      it("allows only the top card", () => {
        expect(canMoveFromPile("blurtz", "bank", blurtzCards(), "R1")).toBe(
          true
        );
        expect(canMoveFromPile("blurtz", "work", blurtzCards(), "R1")).toBe(
          true
        );
      });

      it("rejects a buried card", () => {
        expect(canMoveFromPile("blurtz", "work", blurtzCards(), "G5")).toBe(
          false
        );
        expect(canMoveFromPile("blurtz", "bank", blurtzCards(), "B4")).toBe(
          false
        );
      });
    });

    describe("work piles", () => {
      const workCards = () => [
        card("B3", 3, BLUE),
        card("Y2", 2, YELLOW),
        card("R1", 1, RED), // top
      ];

      it("allows ANY face-up card work→work - it travels with its stack", () => {
        expect(canMoveFromPile("work", "work", workCards(), "B3")).toBe(true);
        expect(canMoveFromPile("work", "work", workCards(), "Y2")).toBe(true);
        expect(canMoveFromPile("work", "work", workCards(), "R1")).toBe(true);
      });

      // Task 7 item 2. Only the accessible card of a work pile may go to a
      // foundation. Without this, a buried card played to a bank pile spliced
      // itself out of the middle of the pile, left the cards above it behind as
      // a stack that was never legal, and scored a point for it - for every
      // face-up card in the pile, repeatably.
      it("allows ONLY the top card work→bank", () => {
        expect(canMoveFromPile("work", "bank", workCards(), "R1")).toBe(true);
        expect(canMoveFromPile("work", "bank", workCards(), "Y2")).toBe(false);
        expect(canMoveFromPile("work", "bank", workCards(), "B3")).toBe(false);
      });

      it("allows the only card of a single-card work pile to go to a bank pile", () => {
        const single = [card("R1", 1, RED)];
        expect(canMoveFromPile("work", "bank", single, "R1")).toBe(true);
      });

      it("rejects a card that is not in the pile", () => {
        expect(canMoveFromPile("work", "work", workCards(), "nope")).toBe(false);
        expect(canMoveFromPile("work", "bank", workCards(), "nope")).toBe(false);
      });
    });
  });

  // =====================================================================
  // validateMove
  // =====================================================================
  describe("validateMove", () => {
    function scenario() {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", [
          card("G5", 5, GREEN, false),
          card("R1", 1, RED),
        ]),
        workPiles: [
          pile("work-1", "work", [card("B3", 3, BLUE), card("Y2", 2, YELLOW)]),
          pile("work-2", "work", []),
        ],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", [])],
        currentTurn: 0,
      };
      return { deck, board };
    }

    it("accepts a legal move", () => {
      const { deck, board } = scenario();
      expect(validateMove(deck, board, "R1", "blurtz-1", "bank-1")).toBeNull();
      expect(validateMove(deck, board, "Y2", "work-1", "work-2")).toBeNull();
    });

    it("rejects a card that is not in the player's deck", () => {
      const { deck, board } = scenario();
      expect(validateMove(deck, board, "nope", "work-1", "bank-1")).toBe(
        "That card is not in your deck"
      );
    });

    it("rejects a face-down card", () => {
      const { deck, board } = scenario();
      expect(validateMove(deck, board, "G5", "blurtz-1", "bank-1")).toBe(
        "That card is face down"
      );
    });

    it("rejects an unknown source or destination pile", () => {
      const { deck, board } = scenario();
      expect(validateMove(deck, board, "R1", "nope", "bank-1")).toBe(
        "Source pile not found"
      );
      expect(validateMove(deck, board, "R1", "blurtz-1", "nope")).toBe(
        "Destination pile not found"
      );
    });

    // The rejection a player hits when they lose a race for a shared pile -
    // worth its own message, because it is the most common one in the game.
    it("distinguishes losing a bank race from an impossible placement", () => {
      const { deck, board } = scenario();
      board.bankPiles[0].cards.push(card("R1x", 1, RED));

      // Y2 is a 2 onto a red 1: right value, wrong colour name.
      expect(validateMove(deck, board, "Y2", "work-1", "bank-1")).toBe(
        "That card no longer fits on that bank pile"
      );
      // B3 cannot go onto Y2 (3 is not 2 - 1).
      expect(validateMove(deck, board, "B3", "work-1", "work-1")).toBe(
        "That card cannot be placed there"
      );
    });

    // Item 2, at the validation layer: the whole reason the fix exists.
    it("rejects a buried work-pile card played to a bank pile", () => {
      const { deck, board } = scenario();
      // A legal work pile with a 1 buried under it.
      deck.workPiles[0].cards = [
        card("R1b", 1, RED),
        card("B9", 9, BLUE),
        card("Y2b", 2, YELLOW),
      ];

      expect(validateMove(deck, board, "R1b", "work-1", "bank-1")).toBe(
        "Only the top card of a work pile can be played to a bank pile"
      );
    });
  });

  // =====================================================================
  // executeMove
  // =====================================================================
  describe("executeMove", () => {
    it("moves the card and everything above it work→work", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", []),
        workPiles: [
          pile("work-1", "work", [
            card("B3", 3, BLUE),
            card("Y2", 2, YELLOW),
            card("R1", 1, RED),
          ]),
          pile("work-2", "work", []),
        ],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = { bankPiles: [], currentTurn: 0 };

      executeMove(deck, board, "Y2", "work-1", "work-2");

      expect(deck.workPiles[0].cards.map((c) => c.id)).toEqual(["B3"]);
      expect(deck.workPiles[1].cards.map((c) => c.id)).toEqual(["Y2", "R1"]);
    });

    it("moves a single card work→bank and leaves the pile beneath intact", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", []),
        workPiles: [
          pile("work-1", "work", [
            card("B3", 3, BLUE),
            card("Y2", 2, YELLOW),
            card("R1", 1, RED),
          ]),
        ],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", [])],
        currentTurn: 0,
      };

      executeMove(deck, board, "R1", "work-1", "bank-1");

      expect(deck.workPiles[0].cards.map((c) => c.id)).toEqual(["B3", "Y2"]);
      expect(board.bankPiles[0].cards.map((c) => c.id)).toEqual(["R1"]);
    });

    // Proves executeMove takes its reach from `cardsMovedBy` rather than
    // keeping a second copy of the rule. `validateMove` makes this move
    // unreachable in a real game; the point here is that the two layers cannot
    // drift apart.
    it("takes its extent from cardsMovedBy: a work→bank move never sweeps the stack", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", []),
        workPiles: [
          pile("work-1", "work", [
            card("R1", 1, RED),
            card("B9", 9, BLUE),
            card("Y2", 2, YELLOW),
          ]),
        ],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", [])],
        currentTurn: 0,
      };

      executeMove(deck, board, "R1", "work-1", "bank-1");

      expect(board.bankPiles[0].cards.map((c) => c.id)).toEqual(["R1"]);
      expect(board.bankPiles[0].cards).toHaveLength(1);
    });

    it("flips the next blurtz card face-up when the top one leaves", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", [
          card("G5", 5, GREEN, false),
          card("B4", 4, BLUE, false),
          card("R1", 1, RED, true),
        ]),
        workPiles: [pile("work-1", "work", [])],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", [])],
        currentTurn: 0,
      };

      executeMove(deck, board, "R1", "blurtz-1", "bank-1");

      expect(deck.blurtzPile.cards.map((c) => c.id)).toEqual(["G5", "B4"]);
      // The newly exposed card is now playable...
      expect(deck.blurtzPile.cards[1].faceUp).toBe(true);
      // ...and the one still buried under it is not.
      expect(deck.blurtzPile.cards[0].faceUp).toBe(false);
    });

    it("does nothing when the card or a pile is missing", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", []),
        workPiles: [pile("work-1", "work", [card("R1", 1, RED)])],
        drawPile: pile("draw-1", "draw", []),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", [])],
        currentTurn: 0,
      };

      executeMove(deck, board, "nope", "work-1", "bank-1");
      executeMove(deck, board, "R1", "nope", "bank-1");
      executeMove(deck, board, "R1", "work-1", "nope");

      expect(deck.workPiles[0].cards.map((c) => c.id)).toEqual(["R1"]);
      expect(board.bankPiles[0].cards).toHaveLength(0);
    });
  });

  // =====================================================================
  // Invariants over sequences of legal moves
  // =====================================================================
  describe("invariants over a sequence of legal moves", () => {
    /**
     * Every property a card is allowed to have.
     *
     * This is how "faceUp is the complete visibility predicate" is actually
     * enforced: if a future change smuggles visibility into a second field -
     * `hidden`, `visibleTo`, `revealed` - this set catches it. The next phase's
     * redaction keys on `faceUp` ALONE, so a card whose visibility is encoded
     * anywhere else would leak.
     */
    const ALLOWED_CARD_KEYS = new Set([
      "id",
      "value",
      "number",
      "color",
      "faceUp",
      "ownerId",
    ]);

    function allCards(deck: PlayerDeck, board: TestBoard): Card[] {
      return [
        ...deck.blurtzPile.cards,
        ...deck.workPiles.flatMap((p) => p.cards),
        ...deck.drawPile.cards,
        ...board.bankPiles.flatMap((p: Pile) => p.cards),
      ];
    }

    /**
     * Every invariant, as one comparable object.
     *
     * Reported rather than asserted piecemeal so a failure names the offending
     * card and the step it happened at, instead of just saying `false !== true`
     * somewhere inside a loop. Every violation list is expected to be empty.
     */
    function invariantReport(
      deck: PlayerDeck,
      board: TestBoard,
      step: string
    ) {
      const cards = allCards(deck, board);
      const ids = cards.map((c) => c.id);

      const seen = new Set<string>();
      const duplicateIds: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) duplicateIds.push(id);
        seen.add(id);
      }

      // Visibility must live in `faceUp` and nowhere else.
      const unknownCardKeys: string[] = [];
      for (const c of cards) {
        for (const key of Object.keys(c)) {
          if (!ALLOWED_CARD_KEYS.has(key)) unknownCardKeys.push(`${c.id}.${key}`);
        }
      }

      // Blurtz: only the top card is ever face-up.
      const blurtzVisibilityViolations = deck.blurtzPile.cards
        .filter((c, i) => c.faceUp !== (i === deck.blurtzPile.cards.length - 1))
        .map((c) => c.id);

      // Work and bank piles hold only face-up cards - a card had to be visible
      // to get there in the first place.
      const faceDownOnWorkOrBank = [...deck.workPiles, ...board.bankPiles]
        .flatMap((p: Pile) => p.cards)
        .filter((c) => !c.faceUp)
        .map((c) => c.id);

      // Draw pile: face-down stock is a prefix, face-up waste a suffix. A
      // face-down card must never sit behind a face-up one.
      const firstFaceUp = deck.drawPile.cards.findIndex((c) => c.faceUp);
      const drawFaceDownAfterFaceUp =
        firstFaceUp === -1
          ? []
          : deck.drawPile.cards
              .slice(firstFaceUp)
              .filter((c) => !c.faceUp)
              .map((c) => c.id);

      return {
        step,
        cardIds: [...ids].sort(),
        duplicateIds,
        unknownCardKeys,
        blurtzVisibilityViolations,
        faceDownOnWorkOrBank,
        drawFaceDownAfterFaceUp,
      };
    }

    function expectInvariants(
      deck: PlayerDeck,
      board: TestBoard,
      expectedIds: string[],
      step: string
    ) {
      expect(invariantReport(deck, board, step)).toEqual({
        step,
        // Conservation: exactly the cards we started with, no more, no fewer.
        cardIds: [...expectedIds].sort(),
        duplicateIds: [],
        unknownCardKeys: [],
        blurtzVisibilityViolations: [],
        faceDownOnWorkOrBank: [],
        drawFaceDownAfterFaceUp: [],
      });
    }

    it("conserves every card, keeps ids unique, and keeps faceUp the whole story", () => {
      const deck: PlayerDeck = {
        blurtzPile: pile("blurtz-1", "blurtz", [
          card("G5", 5, GREEN, false),
          card("Y3", 3, YELLOW, false),
          card("R1", 1, RED, true),
        ]),
        workPiles: [
          // A legal work pile: 3 blue (type a) -> 2 yellow (type b).
          pile("work-1", "work", [card("B3", 3, BLUE), card("Y2", 2, YELLOW)]),
          pile("work-2", "work", [card("R4", 4, RED)]),
          pile("work-3", "work", []),
        ],
        drawPile: pile("draw-1", "draw", [
          card("G7", 7, GREEN, false),
          card("G8", 8, GREEN, false),
          card("B1", 1, BLUE, false),
        ]),
      };
      const board: TestBoard = {
        bankPiles: [pile("bank-1", "bank", []), pile("bank-2", "bank", [])],
        currentTurn: 0,
      };

      const expectedIds = allCards(deck, board).map((c) => c.id);
      expect(expectedIds).toHaveLength(9);

      expectInvariants(deck, board, expectedIds, "initial");

      // 1. Blurtz top (R1) -> empty bank pile. Exposes Y3 underneath.
      expect(validateMove(deck, board, "R1", "blurtz-1", "bank-1")).toBeNull();
      executeMove(deck, board, "R1", "blurtz-1", "bank-1");
      expectInvariants(deck, board, expectedIds, "after blurtz->bank");
      expect(board.bankPiles[0].cards.map((c) => c.id)).toEqual(["R1"]);
      expect(deck.blurtzPile.cards.map((c) => c.id)).toEqual(["G5", "Y3"]);

      // 2. A buried work card (B3) -> an empty work pile, carrying Y2 with it.
      expect(validateMove(deck, board, "B3", "work-1", "work-3")).toBeNull();
      executeMove(deck, board, "B3", "work-1", "work-3");
      expectInvariants(deck, board, expectedIds, "after work->work stack move");
      expect(deck.workPiles[0].cards).toHaveLength(0);
      expect(deck.workPiles[2].cards.map((c) => c.id)).toEqual(["B3", "Y2"]);

      // 3. The newly exposed blurtz card (Y3) -> onto R4. Exposes G5.
      expect(validateMove(deck, board, "Y3", "blurtz-1", "work-2")).toBeNull();
      executeMove(deck, board, "Y3", "blurtz-1", "work-2");
      expectInvariants(deck, board, expectedIds, "after blurtz->work");
      expect(deck.workPiles[1].cards.map((c) => c.id)).toEqual(["R4", "Y3"]);

      // 4. Cycle the draw pile: all three flip face-up, B1 lands playable.
      deck.drawPile.cards = flipDrawPile(deck.drawPile.cards);
      expectInvariants(deck, board, expectedIds, "after draw flip");
      expect(deck.drawPile.cards.map((c) => c.id)).toEqual(["G7", "G8", "B1"]);

      // 5. The last face-up draw card (B1) -> the second, empty bank pile.
      expect(validateMove(deck, board, "B1", "draw-1", "bank-2")).toBeNull();
      executeMove(deck, board, "B1", "draw-1", "bank-2");
      expectInvariants(deck, board, expectedIds, "after draw->bank");
      expect(board.bankPiles[1].cards.map((c) => c.id)).toEqual(["B1"]);
      expect(deck.drawPile.cards.map((c) => c.id)).toEqual(["G7", "G8"]);
    });

    it("conserves cards across a long deal-and-cycle sequence", () => {
      const deck = dealCards(4, seededRng(7));
      const board: TestBoard = { bankPiles: [], currentTurn: 0 };
      const expectedIds = allCards(deck, board).map((c) => c.id);
      expect(expectedIds).toHaveLength(40);

      // Cycling the draw pile many times must never lose, duplicate or reorder
      // a card, and must never break the visibility layout.
      for (let i = 0; i < 15; i++) {
        deck.drawPile.cards = flipDrawPile(deck.drawPile.cards);
        expectInvariants(deck, board, expectedIds, `cycle ${i}`);
      }
    });
  });

  // =====================================================================
  // flipDrawPile - characterization
  // =====================================================================
  describe("flipDrawPile (characterization - this logic is known-good)", () => {
    /**
     * These tests exist to PROTECT the cycling logic from a well-meaning
     * "fix", not to propose one. It was traced independently twice and is
     * correct. If one of these fails, the change is wrong until proven
     * otherwise.
     */

    function stock(n: number): Card[] {
      return Array.from({ length: n }, (_, i) =>
        card(`d${i + 1}`, ((i % 10) + 1) as number, RED, false)
      );
    }

    /** Leading face-down cards: the remaining stock. */
    function leadingFaceDown(cards: Card[]): number {
      let count = 0;
      for (const c of cards) {
        if (!c.faceUp) count++;
        else break;
      }
      return count;
    }

    /** Every rotation of `original`, as joined id strings. */
    function rotationsOf(original: string[]): string[] {
      return original.map((_, i) =>
        [...original.slice(i), ...original.slice(0, i)].join(",")
      );
    }

    it("preserves the id multiset, order and flip count across 13 cycles", () => {
      const original = stock(8);
      const originalIds = original.map((c) => c.id);
      const validRotations = rotationsOf(originalIds);

      // 8 cards cycle as 3 + 3 + 2 then turn over, so 13 flips covers four
      // full cycles and four turnovers.
      const actual: unknown[] = [];
      const expected: unknown[] = [];

      let cards = original.map((c) => ({ ...c }));

      for (let cycle = 1; cycle <= 13; cycle++) {
        const before = cards.map((c) => ({ ...c }));
        const faceUpBefore = before.filter((c) => c.faceUp).length;
        const downBefore = leadingFaceDown(before);

        // Every expectation below is derived from the state BEFORE the flip,
        // independently of what flipDrawPile does - that is what makes this a
        // test rather than a restatement.
        //
        // When the stock is exhausted the whole pile turns face-down again, so
        // the stock for THIS flip is the entire pile.
        const wasReset = downBefore === 0;
        const stockForFlip = wasReset ? before : before.slice(0, downBefore);
        const expectedFlips = Math.min(3, stockForFlip.length);

        cards = flipDrawPile(before);

        actual.push({
          cycle,
          // 1. No card is lost or duplicated.
          ids: [...cards.map((c) => c.id)].sort().join(","),
          // 2. Order is stable: the pile is always a rotation of the original.
          //    That is what makes the cycle a cycle - a shuffle, a reverse or a
          //    dropped card lands outside this set.
          isRotationOfOriginal: validRotations.includes(
            cards.map((c) => c.id).join(",")
          ),
          // 3. Exactly min(3, stock) cards flip, and they are the ones that
          //    were at the front of the stock, in order, now face-up at the
          //    back.
          flipped: cards
            .slice(-expectedFlips)
            .map((c) => c.id)
            .join(","),
          flippedAreFaceUp: cards.slice(-expectedFlips).every((c) => c.faceUp),
          // 4. The face-up count grows by the flip count - or resets to it when
          //    the stock turned over.
          faceUpCount: cards.filter((c) => c.faceUp).length,
        });

        expected.push({
          cycle,
          ids: [...originalIds].sort().join(","),
          isRotationOfOriginal: true,
          flipped: stockForFlip
            .slice(0, expectedFlips)
            .map((c) => c.id)
            .join(","),
          flippedAreFaceUp: true,
          faceUpCount: wasReset ? expectedFlips : faceUpBefore + expectedFlips,
        });
      }

      expect(actual).toEqual(expected);
    });

    it("turns the stock over when it empties, and keeps cycling", () => {
      // 8 cards: 3 + 3 + 2 exhausts the stock, then it resets.
      let cards: Card[] = stock(8);

      cards = flipDrawPile(cards); // 3 flipped, 5 face-down
      expect(leadingFaceDown(cards)).toBe(5);
      expect(cards.filter((c) => c.faceUp)).toHaveLength(3);

      cards = flipDrawPile(cards); // 3 more, 2 face-down
      expect(leadingFaceDown(cards)).toBe(2);
      expect(cards.filter((c) => c.faceUp)).toHaveLength(6);

      cards = flipDrawPile(cards); // only 2 left: min(3, 2) = 2
      expect(leadingFaceDown(cards)).toBe(0);
      expect(cards.filter((c) => c.faceUp)).toHaveLength(8);
      const afterExhaustion = cards.map((c) => c.id);

      // The stock is empty: this flip turns the pile over and deals 3 anew.
      cards = flipDrawPile(cards);
      expect(cards.filter((c) => c.faceUp)).toHaveLength(3);
      expect(leadingFaceDown(cards)).toBe(5);

      // The turnover preserves order: the pile that comes back is the same
      // cycle, rotated on by 3.
      expect(cards.map((c) => c.id)).toEqual([
        ...afterExhaustion.slice(3),
        ...afterExhaustion.slice(0, 3),
      ]);
    });

    it("flips exactly min(3, stock) - never more than the stock holds", () => {
      expect(flipDrawPile(stock(1)).filter((c) => c.faceUp)).toHaveLength(1);
      expect(flipDrawPile(stock(2)).filter((c) => c.faceUp)).toHaveLength(2);
      expect(flipDrawPile(stock(3)).filter((c) => c.faceUp)).toHaveLength(3);
      expect(flipDrawPile(stock(4)).filter((c) => c.faceUp)).toHaveLength(3);
      expect(flipDrawPile(stock(30)).filter((c) => c.faceUp)).toHaveLength(3);
    });

    it("handles an empty draw pile without dying", () => {
      expect(flipDrawPile([])).toEqual([]);
    });

    it("cycles a single card between face-down and face-up forever", () => {
      let cards = stock(1);
      for (let i = 0; i < 5; i++) {
        cards = flipDrawPile(cards);
        expect(cards).toHaveLength(1);
        expect(cards[0].id).toBe("d1");
        // One card is its own stock: it turns over and flips straight back up.
        expect(cards[0].faceUp).toBe(true);
      }
    });

    it("does not mutate its input", () => {
      const input = stock(5);
      const snapshot = input.map((c) => ({ ...c }));

      flipDrawPile(input);

      expect(input).toEqual(snapshot);
      expect(input.every((c) => !c.faceUp)).toBe(true);
    });
  });

  // =====================================================================
  // dealCards
  // =====================================================================
  describe("dealCards", () => {
    it("deals 40 cards - a full deck - to each player", () => {
      for (const numPlayers of [2, 3, 4]) {
        const deck = dealCards(numPlayers, seededRng(1));
        const total =
          deck.blurtzPile.cards.length +
          deck.workPiles.reduce((n, p) => n + p.cards.length, 0) +
          deck.drawPile.cards.length;
        expect(total).toBe(40);
      }
    });

    it("deals a full 4x10 deck with no duplicate ids", () => {
      const deck = dealCards(2, seededRng(3));
      const cards = [
        ...deck.blurtzPile.cards,
        ...deck.workPiles.flatMap((p) => p.cards),
        ...deck.drawPile.cards,
      ];

      expect(new Set(cards.map((c) => c.id)).size).toBe(40);

      // Exactly one of each colour/value pair.
      const pairs = cards.map((c) => `${c.color.name}-${c.value}`);
      expect(new Set(pairs).size).toBe(40);

      // Every colour appears exactly ten times, values 1-10.
      for (const color of ["Red", "Blue", "Yellow", "Green"]) {
        const values = cards
          .filter((c) => c.color.name === color)
          .map((c) => c.value)
          .sort((a, b) => a - b);
        expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
    });

    it("keeps value and number in sync on every dealt card", () => {
      const deck = dealCards(3, seededRng(11));
      const cards = [
        ...deck.blurtzPile.cards,
        ...deck.workPiles.flatMap((p) => p.cards),
        ...deck.drawPile.cards,
      ];
      for (const c of cards) {
        expect(c.number).toBe(c.value);
      }
    });

    it("deals a 10-card blurtz pile with only the top card face-up", () => {
      const deck = dealCards(2, seededRng(5));

      expect(deck.blurtzPile.cards).toHaveLength(10);
      expect(deck.blurtzPile.type).toBe("blurtz");

      deck.blurtzPile.cards.forEach((c, i) => {
        expect(c.faceUp).toBe(i === 9);
      });
    });

    it("deals exactly one face-up card to each work pile", () => {
      for (const numPlayers of [2, 3, 4]) {
        const deck = dealCards(numPlayers, seededRng(2));
        for (const p of deck.workPiles) {
          expect(p.type).toBe("work");
          expect(p.cards).toHaveLength(1);
          expect(p.cards[0].faceUp).toBe(true);
        }
      }
    });

    // Fewer tableau piles as the table grows: more players racing for the same
    // bank piles.
    it.each([
      [2, 5],
      [3, 4],
      [4, 3],
    ])("gives a %i-player game %i work piles", (numPlayers, expected) => {
      expect(dealCards(numPlayers, seededRng(1)).workPiles).toHaveLength(
        expected
      );
    });

    it.each([
      [2, 25],
      [3, 26],
      [4, 27],
    ])(
      "leaves the remainder face-down in the draw pile for %i players (%i cards)",
      (numPlayers, expected) => {
        const deck = dealCards(numPlayers, seededRng(4));
        expect(deck.drawPile.cards).toHaveLength(expected);
        expect(deck.drawPile.type).toBe("draw");
        expect(deck.drawPile.cards.every((c) => !c.faceUp)).toBe(true);
      }
    );

    it("gives every pile a distinct id", () => {
      const deck = dealCards(2, seededRng(9));
      const ids = [
        deck.blurtzPile.id,
        deck.drawPile.id,
        ...deck.workPiles.map((p) => p.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("is deterministic for a given rng, and different across seeds", () => {
      const order = (d: PlayerDeck) =>
        d.blurtzPile.cards.map((c) => `${c.color.name}-${c.value}`).join(",");

      // Same seed, same deal.
      expect(order(dealCards(2, seededRng(42)))).toBe(
        order(dealCards(2, seededRng(42)))
      );
      // Different seed, different deal. (Not a law of the universe, but with
      // these two seeds and a 40-card deck it is a certainty in practice.)
      expect(order(dealCards(2, seededRng(42)))).not.toBe(
        order(dealCards(2, seededRng(43)))
      );
    });

    it("defaults to Math.random when no rng is passed", () => {
      const spy = jest.spyOn(Math, "random");
      try {
        dealCards(2);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // =====================================================================
  // scoreRound
  // =====================================================================
  describe("scoreRound", () => {
    it("scores one per banked card when the blurtz pile is empty", () => {
      expect(scoreRound(0, 0)).toBe(0);
      expect(scoreRound(1, 0)).toBe(1);
      expect(scoreRound(17, 0)).toBe(17);
    });

    it("charges two for every card left on the blurtz pile", () => {
      expect(scoreRound(10, 1)).toBe(8);
      expect(scoreRound(10, 3)).toBe(4);
      expect(scoreRound(10, 5)).toBe(0);
    });

    // The penalty is what makes this a race rather than a hoarding game, and it
    // genuinely goes negative. Do not clamp it at zero.
    it("goes negative when the penalty outweighs the cards banked", () => {
      expect(scoreRound(0, 10)).toBe(-20);
      expect(scoreRound(2, 5)).toBe(-8);
      expect(scoreRound(3, 10)).toBe(-17);
    });

    it("is exactly bankPileCount - 2 x blurtzRemaining", () => {
      for (let banked = 0; banked <= 12; banked++) {
        for (let remaining = 0; remaining <= 10; remaining++) {
          expect(scoreRound(banked, remaining)).toBe(banked - 2 * remaining);
        }
      }
    });
  });
});

/**
 * A tiny deterministic PRNG (mulberry32) so deals are repeatable.
 *
 * Only ever used in tests: `dealCards` defaults to `Math.random` in production.
 */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
