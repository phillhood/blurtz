import { Card, GameState, Pile, Player, PlayerDeck } from "../types";

/**
 * Redaction: turning internal game state into the view a client may hold.
 * Without it, a broadcast ships every opponent's face-down cards with `value`
 * and `color` intact - the UI draws a card back over data sitting in the socket
 * frame, and DevTools reads the table.
 *
 * Pure, like the engine beside it: fresh objects, never mutates its input,
 * because its input is the state the server is still playing with.
 *
 * Takes no `forPlayerId` because redaction is player-INDEPENDENT: you cannot
 * see your own blurtz pile below its top card, nor your own draw pile's
 * face-down segment. So `card.faceUp` is the complete visibility predicate for
 * EVERY observer, one redacted view is correct for all of them, and the gateway
 * can redact once and broadcast with a single `server.to(gameId).emit(...)`.
 * This rests on `validateMove` rejecting any move of a face-down card: nothing
 * a client may legitimately do needs a hidden card's value.
 *
 * Applied at the outbound edge ONLY - `game.gateway.ts` for socket emissions,
 * `game.controller.ts` for the REST state route. The service's mutators
 * deliberately return unredacted state; the caller inside the transaction needs
 * it.
 */

// ---------------------------------------------------------------------------
// The wire types
// ---------------------------------------------------------------------------

/** A card the client is allowed to see in full. */
export type VisibleCard = Card & { faceUp: true };

/**
 * A card the client may only know the existence and position of.
 *
 * `id` is SYNTHETIC (see `hiddenCardId`). Every other field is absent rather
 * than nulled out: a field that is not in the payload cannot be read out of it.
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
 * `deck` is null until the game is dealt - `joinGame` writes the Player row
 * with `deck: null`, so every lobby broadcast carries players in that state.
 * The internal `Player` type tells the same white lie; correcting it is not
 * redaction's job.
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
 * A hidden card must not travel under its real id. `flipDrawPile` turns
 * face-up cards face-down AGAIN whenever the stock is exhausted, so a client
 * that recorded `id -> value` while a card was legitimately visible could
 * recognise it for the rest of the game and read the whole draw pile through
 * the "redacted" feed. Position breaks that link at every reset.
 *
 * Pile ids are UUIDs, so `pileId` + `index` is unique across the payload -
 * all React keys and dnd-kit ids need, and all a hidden card's id is used for.
 * No face-down card is draggable, so no synthetic id survives a round trip.
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

  // A whitelist, not spread-and-delete: a spread would carry any field a future
  // `Card` grows straight out to the client. This must fail closed.
  return { id: hiddenCardId(pileId, index), faceUp: false };
}

/**
 * Tolerant of a missing pile on purpose: decks come out of a JSON column that
 * `readGameState` casts rather than validates, and a half-written row must not
 * take the broadcast down for everyone else in the game.
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
 * The redacted view of a game state, safe to hand to ANY client in the game.
 *
 * Every card in every pile passes through if it is face-up and is reduced to
 * `{ id, faceUp: false }` if it is not. Everything that is not a card carries
 * through unchanged - none of it is secret, and the client renders all of it.
 */
export function toClientGameState(state: GameState): ClientGameState {
  return {
    ...state,
    players: (state.players ?? []).map(redactPlayer),
    bankPiles: (state.bankPiles ?? []).map(redactPile),
  };
}
