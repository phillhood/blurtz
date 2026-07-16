import { User } from "./user.types";

/**
 * The game's domain types, hand-written.
 *
 * Deliberately NOT `z.infer` versions of the schemas in
 * `server/src/schemas/`. Zod is for parsing untrusted input at a boundary, not
 * for authoring domain types: inferred types hover as unreadable generic soup,
 * and deriving these from a schema would drag zod into the client's dependency
 * graph to describe a card. The dependency runs the other way - the schemas
 * are pinned to these types with `z.ZodType<T>`, so a schema that drifts from
 * this file fails to compile.
 */

/**
 * A card.
 *
 * `value` is the only name for the number on its face. There used to be a
 * `number` alias beside it, kept in sync by `createFullDeck` writing both: the
 * server compared `value`, the client compared `number`, and the two agreed
 * only because one function remembered to. There was no `Card` without both,
 * and no rule about which to use.
 *
 * There was also an `ownerId?`, described as "track which player owns this
 * card", which nothing has ever assigned or read. A card's owner is the deck
 * it is in.
 *
 * Both lived in the `Player.deck` JSON blob, so dropping them needs no
 * migration: old rows carry fields nothing reads, and the next write drops
 * them.
 */
export interface Card {
  id: string;
  value: number;
  color: CardColor;
  faceUp: boolean;
}

export interface CardColor {
  name: string;
  code: string;
  type: "a" | "b";
}

export type CardColorString = string;

// Pile types
export interface Pile {
  id: string;
  type: PileType;
  cards: Card[];
}

export type PileType = "blurtz" | "work" | "draw" | "bank";

export interface PlayerDeck {
  blurtzPile: Pile;
  workPiles: Pile[];
  drawPile: Pile;
}

// Player types
export interface Player {
  id: string;
  username: string;
  user: User;
  isReady: boolean;
  deck: PlayerDeck;
  /**
   * CUMULATIVE across every round played so far - this is what `targetScore`
   * is compared against, and a round advance must never reset it.
   *
   * It used to be neither: `callBlitz` OVERWROTE it with the round's score
   * every time, which was invisible while there was only ever one round.
   */
  score: number;
  /** This round's score alone. Reset to 0 on every round advance. */
  roundScore: number;
  /** Cards banked THIS round. Reset on every round advance; `score` is not. */
  bankPileCount: number;
}

/**
 * Game status.
 *
 * `round_over` is the interstitial between rounds: the Blitz has been scored
 * but nobody has reached `targetScore`, so the game is waiting for every
 * player to ready up before it deals the next round.
 *
 * `starting` and `paused` are still unreachable. They are kept because
 * removing a value from a Postgres enum means rebuilding the type and every
 * column that uses it - and `starting` has a use ahead of it as a countdown.
 */
export type GameStatus =
  | "waiting"
  | "starting"
  | "playing"
  | "round_over"
  | "paused"
  | "finished";

// Game listing - minimal info for game lists/lobbies
export interface GameListing {
  id: string;
  name: string;
  alias: string;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * The JSON stored in the `game.gameState` column.
 *
 * The shared board, and that is all it has ever been. It used to carry a
 * `currentTurn: number` that `initializeGameState` set to 0 and nothing ever
 * incremented, read or branched on - because Blurtz has no turns. Everybody
 * plays at once, racing for the same bank piles; that is the entire game.
 *
 * It lives in a JSON blob, so removing it needs no migration.
 */
export interface GameplayState {
  bankPiles: Pile[];
}

/**
 * Full game state - the complete state built for clients.
 *
 * This had a `currentTurn: string` too - a player id, unrelated to
 * `GameplayState.currentTurn` (a number) beyond the name they shared, which is
 * its own reason to be rid of one of them. `readGameState` fabricated it as
 * `players[0]?.id` on every read: not the player whose turn it was, just the
 * first row the query returned. No caller on either side read it. Gone.
 */
export interface GameState extends GameListing {
  hostId: string;
  players: Player[];
  bankPiles: Pile[];
  /**
   * 1-BASED. A game is in round 1 from creation until the first Blitz, so
   * there is no round 0 and no gap between the number stored and the number a
   * player is shown.
   *
   * `readGameState` used to hard-code this to 0 and no round ever advanced.
   */
  currentRound: number;
  /** The cumulative score that ends the game when any player reaches it. */
  targetScore: number;
  /** The winning PLAYER's id, or null - including while a game is unfinished. */
  winner?: string | null;
}

// Alias for backwards compatibility
export type Game = GameListing;

/**
 * The outcome of a move attempt.
 *
 * A rejected move carries state too. Without it the client has no object to
 * swap in, so its "this move is in flight" bookkeeping never clears and the
 * card it was moving stays invisible on a pile it never left.
 *
 * `state` is UNREDACTED internal state, built inside the move's transaction.
 * Hiding opponents' face-down cards is the gateway's job, not this type's.
 */
export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };

// Game events
export type GameAction =
  | "MOVE_CARD"
  | "FLIP_CARD"
  | "BLITZ_CALLED"
  | "GAME_START"
  | "GAME_END"
  | "PLAYER_JOIN"
  | "PLAYER_LEAVE";

export interface GameEvent {
  type: GameAction;
  playerId: string;
  data: unknown;
  timestamp: Date;
}

export interface MoveCardEvent {
  cardId: string;
  fromPileId: string;
  toPileId: string;
  fromPosition: number;
  toPosition: number;
}

// `GameSnapshot` used to live here, mirroring a `game_snapshots` table that
// held one whole-state JSON blob per game and had no readers on either side.
// Both are gone: the per-round scoring inputs are in `round_results` now, which
// is a scoreboard you can query rather than a dump you have to replay.
