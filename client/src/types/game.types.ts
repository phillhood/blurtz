/**
 * The game types, as the client sees them: re-exports of `@blurtz/shared`, not
 * copies.
 *
 * The mapping is the point. What the client calls a `Pile` is the REDACTED pile
 * the server publishes (`ClientPile`), not the server's internal one - a
 * face-down card on the wire carries an id and nothing else, and these names are
 * what make the client incapable of expecting otherwise.
 *
 * This file exists only so the `@types` barrel keeps one meaning: "the types
 * this app uses", wherever they are authored. `@blurtz/shared` resolves through
 * the workspace symlink - there is deliberately no path alias for it.
 */
export type {
  // The card union. A `ClientCard` is a `VisibleCard | HiddenCard`
  // discriminated on `faceUp`, so reading `.value` off a card that has not
  // been narrowed is a compile error rather than a leak.
  CardColor,
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

/**
 * A failure the game is showing the player.
 *
 * `code` is the server's typed reason, or null when the client itself produced
 * the error. It is the ONLY input to whether this is fatal - `message` is for
 * the player to read, never for code to inspect.
 */
export interface GameError {
  code: string | null;
  message: string;
}

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
