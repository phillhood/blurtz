import { v4 as uuidv4 } from "uuid";
import { Card, GameplayState, Pile, PileType, PlayerDeck } from "../types";
import { CARD_COLORS, CARD_VALUES, GAME_CONSTANTS } from "../constants";

/**
 * The Blurtz rules engine.
 *
 * Everything in this file is a pure function of its arguments: no Prisma, no
 * Nest, no `this`, no I/O, no logging. That is deliberate and load-bearing -
 * these rules are destined to be shared verbatim with the client, and anything
 * that reaches for a database or a logger cannot make that trip.
 *
 * "Pure" here allows two generators, both injectable and both only ever used to
 * mint fresh things rather than to read the world: `uuidv4` for card and pile
 * ids, and an `Rng` for the shuffle.
 *
 * Mutation rules: functions that answer a question (`canPlace`,
 * `canMoveFromPile`, `cardsMovedBy`, `flipDrawPile`, `scoreRound`) never touch
 * their arguments. `executeMove` is the one deliberate exception - it mutates
 * the deck and board it is handed, because that is what the caller then writes
 * back to the database.
 */

/** A source of randomness, injectable so callers can make dealing deterministic. */
export type Rng = () => number;

/**
 * The board state a move is resolved against - the `Game.gameState` JSON blob.
 *
 * Typed loosely on purpose: this comes out of a JSON column, so `bankPiles`
 * genuinely can be absent on an old or half-written row, and the lookups below
 * have always tolerated that.
 */
export type BoardState = Partial<GameplayState> & Record<string, any>;

// ---------------------------------------------------------------------------
// Placement: may this card land on this pile?
// ---------------------------------------------------------------------------

/**
 * Whether `card` may be placed on a pile of `pileType` whose current top card
 * is `topCard` (absent when the pile is empty).
 *
 * - work: descending by one, alternating `color.type`. An EMPTY work pile
 *   accepts ANY card - there is no "kings only" restriction in Blurtz. (The
 *   client's dead constants copy claims an empty work pile takes only a 10;
 *   it is wrong, and `engine.spec.ts` pins that down.)
 * - bank: ascending by one, same `color.name`, and an empty pile starts at 1.
 * - blurtz/draw: never a destination. Cards leave those piles; they never
 *   arrive.
 *
 * Note the asymmetry: work piles alternate on `color.type` ("a" = red/blue,
 * "b" = yellow/green) while bank piles match on `color.name`. That is the real
 * rule, not an oversight.
 *
 * A completed 1-10 bank pile is inert and needs no special case: the ascending
 * rule can only accept an 11, and there is no 11. Do not add a clear-at-10.
 */
export function canPlace(
  pileType: PileType,
  topCard: Card | null | undefined,
  card: Card
): boolean {
  switch (pileType) {
    case "work":
      if (!topCard) return true;
      return (
        card.value === topCard.value - 1 &&
        card.color.type !== topCard.color.type
      );
    case "bank":
      if (!topCard) return card.value === 1;
      return (
        card.value === topCard.value + 1 &&
        card.color.name === topCard.color.name
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Source access: may this card leave this pile, for this destination?
// ---------------------------------------------------------------------------

/**
 * Why `cardId` cannot be taken out of a `fromType` pile bound for a `toType`
 * pile, or null when it can.
 *
 * This is the reason-carrying twin of `canMoveFromPile`. The two must stay a
 * single rule with two shapes: the server wants to tell the player what went
 * wrong, the client only wants a boolean to grey out a drag target.
 *
 * The rules, by source:
 * - draw: only the LAST face-up card is accessible (the top of the waste).
 * - blurtz: only the top card.
 * - work → work: any face-up card, because it travels with the stack above it.
 * - work → bank: ONLY the top card. This is the one that matters. A buried card
 *   played straight to a foundation used to be accepted, splicing itself out of
 *   the middle of the pile and leaving the cards above it behind as a stack
 *   that was never legal - free score, corrupt board, repeatable for every card
 *   in the pile. In Nertz a foundation only ever takes the accessible card; a
 *   buried card moves as part of a stack, and only to another work pile.
 */
export function moveFromPileRejection(
  fromType: PileType,
  toType: PileType,
  cards: Card[],
  cardId: string
): string | null {
  switch (fromType) {
    case "draw": {
      const faceUpCards = cards.filter((c) => c.faceUp);
      const topFaceUpCard = faceUpCards[faceUpCards.length - 1];
      if (topFaceUpCard?.id !== cardId) {
        return "Only the top card of the draw pile can be played";
      }
      return null;
    }
    case "work": {
      const cardIndex = cards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return "That card is not in the source pile";
      if (toType === "bank" && cardIndex !== cards.length - 1) {
        return "Only the top card of a work pile can be played to a bank pile";
      }
      return null;
    }
    default: {
      const topCard = cards[cards.length - 1];
      if (topCard?.id !== cardId) {
        return "Only the top card of the blurtz pile can be played";
      }
      return null;
    }
  }
}

/**
 * Whether `cardId` is takeable from a `fromType` pile for a move to `toType`.
 *
 * The boolean face of `moveFromPileRejection` - the shape the client wants.
 */
export function canMoveFromPile(
  fromType: PileType,
  toType: PileType,
  cards: Card[],
  cardId: string
): boolean {
  return moveFromPileRejection(fromType, toType, cards, cardId) === null;
}

// ---------------------------------------------------------------------------
// Move extent: how many cards travel?
// ---------------------------------------------------------------------------

/**
 * The cards a move would carry: `cardId` plus, for a work→work move only,
 * everything stacked above it.
 *
 * A stack move is work→work and nothing else. Every other move - including
 * work→bank - carries exactly ONE card. Getting this wrong is how a single
 * play to a foundation swept a whole tableau stack onto it.
 *
 * Generic in the card, because this rule reads nothing but `id`: it is about
 * how FAR a move reaches, not about what the cards are. That is what lets the
 * client call it with the redacted `ClientCard`s it actually holds - where a
 * face-down card has no `value` and never could - and get the same answer from
 * the same function the server moves cards with. The client's own copy of this
 * (`getMovingCardIds`) was destination-blind and swept the whole stack for
 * every move out of a work pile; there is one function now, and one test.
 *
 * Returns a copy; nothing here mutates `cards`. Empty when the card is absent.
 */
export function cardsMovedBy<T extends { id: string }>(
  fromType: PileType,
  toType: PileType,
  cards: T[],
  cardId: string
): T[] {
  const cardIndex = cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return [];

  const isStackMove = fromType === "work" && toType === "work";
  return isStackMove
    ? cards.slice(cardIndex)
    : cards.slice(cardIndex, cardIndex + 1);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Find a card anywhere in a player's own deck. Bank piles are not searched. */
export function findCard(playerDeck: PlayerDeck, cardId: string): Card | null {
  const allPiles = [
    playerDeck.blurtzPile,
    playerDeck.drawPile,
    ...playerDeck.workPiles,
  ];

  for (const pile of allPiles) {
    const card = pile.cards.find((c) => c.id === cardId);
    if (card) return card;
  }

  return null;
}

/**
 * Find a pile by id, in the player's deck or among the shared bank piles.
 *
 * Returns the live object, not a copy - `executeMove` needs to mutate it.
 */
export function findPile(
  playerDeck: PlayerDeck,
  board: BoardState,
  pileId: string
): Pile | null {
  if (playerDeck.blurtzPile.id === pileId) return playerDeck.blurtzPile;
  if (playerDeck.drawPile.id === pileId) return playerDeck.drawPile;

  const workPile = playerDeck.workPiles.find((p) => p.id === pileId);
  if (workPile) return workPile;

  const bankPile = board.bankPiles?.find((p: Pile) => p.id === pileId);
  if (bankPile) return bankPile;

  return null;
}

// ---------------------------------------------------------------------------
// The move pipeline
// ---------------------------------------------------------------------------

/**
 * Validate a move, returning null when it is legal or a reason when it is not.
 *
 * The reason travels back to the player who tried the move. "Someone beat you
 * to that pile" is the single most common outcome in a game built on racing for
 * shared piles, and it deserves to be distinguishable from "that card isn't
 * yours to move".
 */
export function validateMove(
  playerDeck: PlayerDeck,
  board: BoardState,
  cardId: string,
  fromPileId: string,
  toPileId: string
): string | null {
  const card = findCard(playerDeck, cardId);
  if (!card) return "That card is not in your deck";

  if (!card.faceUp) return "That card is face down";

  const fromPile = findPile(playerDeck, board, fromPileId);
  const toPile = findPile(playerDeck, board, toPileId);

  if (!fromPile) return "Source pile not found";
  if (!toPile) return "Destination pile not found";

  const sourceRejection = moveFromPileRejection(
    fromPile.type,
    toPile.type,
    fromPile.cards,
    cardId
  );
  if (sourceRejection) return sourceRejection;

  const topCard = toPile.cards[toPile.cards.length - 1];
  if (!canPlace(toPile.type, topCard, card)) {
    // The bank piles are shared, so a placement that was legal when the player
    // picked the card up may have been taken in the meantime.
    return toPile.type === "bank"
      ? "That card no longer fits on that bank pile"
      : "That card cannot be placed there";
  }

  return null;
}

/**
 * Apply a move, MUTATING `playerDeck` and `board` in place.
 *
 * The caller writes both back to the database, so mutation is the point. This
 * function does not re-validate: run `validateMove` first. Handed an illegal
 * move it will happily perform it.
 */
export function executeMove(
  playerDeck: PlayerDeck,
  board: BoardState,
  cardId: string,
  fromPileId: string,
  toPileId: string
): void {
  const fromPile = findPile(playerDeck, board, fromPileId);
  const toPile = findPile(playerDeck, board, toPileId);

  if (!fromPile || !toPile) return;

  const cardIndex = fromPile.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return;

  // How far the move reaches is `cardsMovedBy`'s decision, not this function's:
  // one rule, one home. This only has to splice out what it names.
  const moving = cardsMovedBy(
    fromPile.type,
    toPile.type,
    fromPile.cards,
    cardId
  );
  const cardsToMove = fromPile.cards.splice(cardIndex, moving.length);

  toPile.cards.push(...cardsToMove);

  // Emptying the blurtz pile's top card exposes the next one.
  if (fromPile.type === "blurtz" && fromPile.cards.length > 0) {
    const nextCard = fromPile.cards[fromPile.cards.length - 1];
    nextCard.faceUp = true;
  }
}

// ---------------------------------------------------------------------------
// The draw pile
// ---------------------------------------------------------------------------

/**
 * Cycle the draw pile: flip up to three cards from the stock onto the waste.
 *
 * KNOWN-GOOD. This logic was traced independently twice and is correct; its
 * characterization test cycles it 11+ times and pins id-preservation, order
 * stability and the flip count. If it looks wrong to you, read that test before
 * you "fix" it.
 *
 * The array is one list with two segments: [face-down stock at the front]
 * [face-up waste at the end]. A flip splices three off the front, turns them
 * face-up and appends them - so the waste grows in flip order and its LAST card
 * is the playable one. When the stock runs out, the whole array turns face-down
 * again in place, which preserves the cycle order exactly.
 *
 * Returns a new array of new card objects; the input is untouched.
 */
export function flipDrawPile(cards: Card[]): Card[] {
  const next = cards.map((c) => ({ ...c }));

  // Count the face-down cards at the front - that is the remaining stock.
  let drawCount = 0;
  for (const c of next) {
    if (!c.faceUp) drawCount++;
    else break;
  }

  if (drawCount === 0) {
    // Stock exhausted: turn everything face-down again, keeping order.
    next.forEach((c) => (c.faceUp = false));
    drawCount = next.length;
  }

  const numToFlip = Math.min(3, drawCount);
  if (numToFlip > 0) {
    const toFlip = next.splice(0, numToFlip);
    toFlip.forEach((c) => (c.faceUp = true));
    next.push(...toFlip);
  }

  return next;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** A fresh 40-card deck: four colours × values 1-10, all face-down. */
export function createFullDeck(): Card[] {
  const cards: Card[] = [];

  Object.values(CARD_COLORS).forEach((color) => {
    CARD_VALUES.forEach((value) => {
      cards.push({
        id: uuidv4(),
        // `value` and `number` are two names for one field, kept in sync here.
        // The engine compares `value`.
        value,
        number: value,
        color,
        faceUp: false,
      });
    });
  });

  return cards;
}

/** The shared foundations. Never recycled, so there is one per 1 in play. */
export function createBankPiles(): Pile[] {
  return Array.from({ length: GAME_CONSTANTS.BANK_PILE_COUNT }, () => ({
    id: uuidv4(),
    type: "bank" as const,
    cards: [],
  }));
}

/** The `Game.gameState` blob a new game starts life with. */
export function initializeGameState(): GameplayState {
  return {
    bankPiles: createBankPiles(),
    currentTurn: 0,
  };
}

/** An empty deck skeleton with the right number of work piles. */
export function createPlayerDeck(workPileCount: number): PlayerDeck {
  return {
    blurtzPile: {
      id: uuidv4(),
      type: "blurtz",
      cards: [],
    },
    workPiles: Array.from({ length: workPileCount }, () => ({
      id: uuidv4(),
      type: "work" as const,
      cards: [],
    })),
    drawPile: {
      id: uuidv4(),
      type: "draw",
      cards: [],
    },
  };
}

/**
 * Fisher-Yates, MUTATING `deck` in place.
 *
 * `rng` defaults to `Math.random`; pass a seeded one to make a deal repeatable.
 */
export function shuffleDeck(deck: Card[], rng: Rng = Math.random): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

/**
 * Deal one player's opening deck for a `numPlayers` game.
 *
 * 10 to the blurtz pile with only the top face-up, one face-up card to each
 * work pile, and the remaining 40 - 10 - workPileCount face-down in the draw
 * pile. The work-pile count shrinks as the table grows (2→5, 3→4, 4→3): fewer
 * tableau piles each, because more players are racing for the same bank piles.
 *
 * `rng` is injectable so tests can deal deterministically.
 */
export function dealCards(numPlayers: number, rng: Rng = Math.random): PlayerDeck {
  const workPileCount = GAME_CONSTANTS.WORK_PILE_COUNT[numPlayers];
  const deck = createFullDeck();
  shuffleDeck(deck, rng);

  const playerDeck = createPlayerDeck(workPileCount);

  // 10 cards to the blurtz pile, only the top one face-up.
  for (let i = 0; i < GAME_CONSTANTS.BLURTZ_PILE_SIZE; i++) {
    const card = deck.pop()!;
    card.faceUp = i === GAME_CONSTANTS.BLURTZ_PILE_SIZE - 1;
    playerDeck.blurtzPile.cards.push(card);
  }

  // One face-up card to each work pile.
  for (let i = 0; i < workPileCount; i++) {
    const card = deck.pop()!;
    card.faceUp = true;
    playerDeck.workPiles[i].cards.push(card);
  }

  // The rest is the draw pile, face-down.
  playerDeck.drawPile.cards = deck.map((card) => ({
    ...card,
    faceUp: false,
  }));

  return playerDeck;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * A player's score for a round: one point per card banked, minus two for every
 * card still stranded on their blurtz pile.
 *
 * The penalty is what makes Blurtz a race rather than a hoarding game, and it
 * genuinely can go negative - a player who banks nothing and is caught with a
 * full blurtz pile scores -20. Do not clamp it.
 */
export function scoreRound(bankPileCount: number, blurtzRemaining: number): number {
  return bankPileCount - 2 * blurtzRemaining;
}
