import { User } from "./user.types";

/**
 * The game's domain types, hand-written - deliberately NOT `z.infer` versions
 * of the schemas in `server/src/schemas/`. The dependency runs the other way:
 * those schemas are pinned to these types with `z.ZodType<T>`, so a schema that
 * drifts from this file fails to compile. Zod parses untrusted input at a
 * boundary; it does not author domain types, and the client should not have to
 * carry a parser to describe a card.
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

export interface Player {
  id: string;
  username: string;
  user: User;
  isReady: boolean;
  deck: PlayerDeck;
  /**
   * CUMULATIVE across every round played so far - this is what `targetScore`
   * is compared against, and a round advance must never reset it.
   */
  score: number;
  /** This round's score alone. Reset to 0 on every round advance. */
  roundScore: number;
  /** Cards banked THIS round. Reset on every round advance; `score` is not. */
  bankPileCount: number;
}

/**
 * `round_over` is the interstitial between rounds: the Blitz has been scored
 * but nobody has reached `targetScore`, so the game waits for every player to
 * ready up before it deals the next round.
 *
 * `starting` and `paused` are unreachable, and kept anyway: removing a value
 * from a Postgres enum means rebuilding the type and every column using it.
 */
export type GameStatus =
  | "waiting"
  | "starting"
  | "playing"
  | "round_over"
  | "paused"
  | "finished";

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
 * The JSON stored in the `game.gameState` column: the shared board, and only
 * the shared board. There is no `currentTurn` because Blurtz has no turns -
 * everybody plays at once, racing for the same bank piles.
 */
export interface GameplayState {
  bankPiles: Pile[];
}

/** Full game state - the complete state built for clients. */
export interface GameState extends GameListing {
  hostId: string;
  players: Player[];
  bankPiles: Pile[];
  /**
   * 1-BASED. A game is in round 1 from creation until the first Blitz, so there
   * is no round 0 and no gap between the number stored and the number a player
   * is shown.
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
 * A rejected move carries state too: without it the client has no object to
 * swap in, so its "move in flight" bookkeeping never clears and the card stays
 * invisible on a pile it never left.
 *
 * `state` is UNREDACTED internal state, built inside the move's transaction.
 * Hiding face-down cards is the gateway's job, not this type's.
 */
export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };

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

export interface MatchHistoryItem {
  gameId: string;
  name: string;
  playedAt: string; // ISO timestamp (game.createdAt)
  targetScore: number;
  rounds: number; // rounds played (game.currentRound)
  players: { username: string; finalScore: number }[]; // sorted by finalScore desc
  myScore: number;
  won: boolean;
}

export interface GameRoundResult {
  username: string;
  roundScore: number;
  cumulativeScore: number;
  bankPileCount: number;
  blurtzRemaining: number;
  calledBlurtz: boolean;
}

export interface GameResultsDetail {
  gameId: string;
  name: string;
  targetScore: number;
  winnerUsername: string | null;
  rounds: { round: number; results: GameRoundResult[] }[];
}
