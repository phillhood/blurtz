/**
 * The game types, as the client sees them.
 *
 * These are re-exports of `@blurtz/shared`, not copies. They used to be a
 * hand-maintained mirror of `server/src/types/game.types.ts` and had drifted
 * from it - most of the client compared `card.number` while the server
 * compared `card.value`, two names for one field that only agreed because
 * `createFullDeck` wrote both.
 *
 * The mapping is the point: what the client calls a `Pile` is the REDACTED
 * pile the server publishes (`ClientPile`), not the server's internal one. A
 * face-down card on the wire carries an id and nothing else, and these names
 * are what make the client incapable of expecting otherwise.
 *
 * `@blurtz/shared` resolves through the workspace symlink like any other
 * dependency - there is no path alias for it, deliberately. This file stays
 * only so the client's `@types` barrel keeps one meaning: "the types this app
 * uses", wherever they are authored.
 */
export type {
  // The card union. A `ClientCard` is a `VisibleCard | HiddenCard`
  // discriminated on `faceUp`, so reading `.value` off a card that has not
  // been narrowed is a compile error rather than a leak.
  CardColor,
  CardColorString,
  ClientCard,
  HiddenCard,
  VisibleCard,
  PileType,
  GameStatus,
  GameAction,
  GameEvent,
  MoveCardEvent,
  // The redacted state, under the names the client has always used for it.
  GameListing as Game,
  ClientGameState as GameState,
  ClientPile as Pile,
  ClientPlayer as Player,
  ClientPlayerDeck as PlayerDeck,
} from "@blurtz/shared";

// Client-only, because only a lobby list has filters and buttons.
export interface GameFilters {
  status?: string;
  currentPlayers?: number;
}

export interface GameActions {
  onJoin: (gameId: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}
