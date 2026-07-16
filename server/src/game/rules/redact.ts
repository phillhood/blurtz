import { Card, GameState, Pile, Player, PlayerDeck } from "@types";

/**
 * Redaction: turning internal game state into the view a client may hold.
 *
 * Like the engine beside it, everything here is a pure function of its
 * arguments - no Prisma, no Nest, no I/O. It returns fresh objects and never
 * mutates its input, because its input is the state the server is still
 * playing with.
 *
 * WHY THIS EXISTS
 *
 * `readGameState` builds every player's deck straight out of the `Player.deck`
 * JSON blob, face-down cards and all. Broadcast as-is, every client receives
 * every opponent's whole deal with `value` and `color` intact - the UI merely
 * draws a card back over data that is sitting in the socket frame. Opening
 * DevTools reads the table.
 *
 * WHY IT TAKES NO `forPlayerId`
 *
 * Redaction is player-INDEPENDENT. You cannot see your own blurtz pile below
 * its top card, and you cannot see the face-down segment of your own draw pile
 * either. So `card.faceUp` is the complete visibility predicate for EVERY
 * observer, and one redacted view is correct for all of them - which is what
 * lets the gateway redact once and keep broadcasting with a single
 * `server.to(gameId).emit(...)` instead of fanning out a private copy per
 * socket.
 *
 * The engine's suite pins the invariant this rests on: the only cards a player
 * may ever move or read are face-up ones (`validateMove` rejects "That card is
 * face down"), so nothing a client is entitled to do needs a face-down card's
 * value.
 *
 * WHERE IT IS APPLIED
 *
 * At the outbound edge only - `game.gateway.ts` for every socket emission and
 * `game.controller.ts` for the REST state route. The service's mutators
 * deliberately return UNREDACTED internal state; they are the game's own view
 * of itself and the caller inside the transaction still needs it.
 */

// ---------------------------------------------------------------------------
// The wire types
// ---------------------------------------------------------------------------

/** A card the client is allowed to see in full. */
export type VisibleCard = Card & { faceUp: true };

/**
 * A card the client may only know the existence and position of.
 *
 * `id` here is SYNTHETIC (see `hiddenCardId`), and there is deliberately no
 * `value`, `number`, `color` or `ownerId` - not "nulled out", absent. A field
 * that is not in the payload cannot be read out of it.
 */
export interface HiddenCard {
  id: string;
  faceUp: false;
}

/**
 * A card as it goes over the wire: a discriminated union on `faceUp`.
 *
 * The client mirrors this type, where `strict` narrowing turns reading
 * `.value` off a face-down card into a compile error rather than a bug.
 */
export type ClientCard = VisibleCard | HiddenCard;

export interface ClientPile extends Omit<Pile, "cards"> {
  cards: ClientCard[];
}

export interface ClientPlayerDeck {
  blurtzPile: ClientPile;
  workPiles: ClientPile[];
  drawPile: ClientPile;
}

/**
 * `deck` is null until the game is dealt - `joinGame` creates the Player row
 * with `deck: null`, and every lobby broadcast carries players in that state.
 * The internal `Player` type has always told the same white lie; redaction is
 * not the place to start correcting it.
 */
export interface ClientPlayer extends Omit<Player, "deck"> {
  deck: ClientPlayerDeck;
}

export interface ClientGameState extends Omit<GameState, "players" | "bankPiles"> {
  players: ClientPlayer[];
  bankPiles: ClientPile[];
}

// ---------------------------------------------------------------------------
// Synthetic ids
// ---------------------------------------------------------------------------

const HIDDEN_ID_PREFIX = "hidden";

/**
 * The id a hidden card is published under: its POSITION, not its identity.
 *
 * A hidden card must not travel under its real id, and this is not
 * hair-splitting. `flipDrawPile` turns cards that have been face-up face-down
 * AGAIN every time the stock is exhausted, so a client that recorded
 * `id -> value` while a card was legitimately visible could recognise it for
 * the rest of the game and read the whole draw pile through the "redacted"
 * feed. Publishing position instead breaks that link at every reset: the id a
 * card is hidden under says nothing about which card it is.
 *
 * Pile ids are UUIDs and unique across a game state, so `pileId` + `index` is
 * unique across the whole payload - which is all React keys and dnd-kit ids
 * need, and all a hidden card's id is ever used for. No face-down card is
 * draggable (`BlurtzPile`, `DrawPileComponent` and the server all refuse), so
 * no synthetic id ever has to survive a round trip.
 */
function hiddenCardId(pileId: string, index: number): string {
  return `${HIDDEN_ID_PREFIX}:${pileId}:${index}`;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

function redactCard(card: Card, pileId: string, index: number): ClientCard {
  if (card?.faceUp) {
    return card as VisibleCard;
  }

  // Built field by field rather than spread-and-delete: a spread would carry
  // any field a future `Card` grows straight out to the client, and this must
  // fail closed.
  return { id: hiddenCardId(pileId, index), faceUp: false };
}

/**
 * Tolerant of a missing pile on purpose: decks come out of a JSON column, and
 * `readGameState` casts them rather than validating them. A half-written row
 * must not take the broadcast down for everyone else in the game.
 */
function redactPile(pile: Pile): ClientPile {
  if (!pile) return pile as unknown as ClientPile;

  return {
    ...pile,
    cards: (pile.cards ?? []).map((card, index) =>
      redactCard(card, pile.id, index)
    ),
  };
}

function redactDeck(deck: PlayerDeck): ClientPlayerDeck {
  if (!deck) return deck as unknown as ClientPlayerDeck;

  return {
    ...deck,
    blurtzPile: redactPile(deck.blurtzPile),
    workPiles: (deck.workPiles ?? []).map(redactPile),
    drawPile: redactPile(deck.drawPile),
  };
}

function redactPlayer(player: Player): ClientPlayer {
  return {
    ...player,
    deck: redactDeck(player.deck),
  };
}

/**
 * The redacted view of a game state, safe to hand to any client in the game.
 *
 * Every card in every pile - each player's blurtzPile, workPiles and drawPile,
 * plus the shared bankPiles - is passed through if it is face-up and reduced to
 * `{ id, faceUp: false }` if it is not.
 *
 * Everything that is not a card is carried through unchanged: ids, usernames,
 * scores, `bankPileCount`, status, winner. None of it is secret, and the client
 * renders all of it.
 */
export function toClientGameState(state: GameState): ClientGameState {
  return {
    ...state,
    players: (state.players ?? []).map(redactPlayer),
    bankPiles: (state.bankPiles ?? []).map(redactPile),
  };
}
