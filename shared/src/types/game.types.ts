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

// Card types
export interface Card {
  id: string;
  value: number;
  number: number;
  color: CardColor;
  faceUp: boolean;
  ownerId?: string; // Track which player owns this card
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
  score: number;
  bankPileCount: number;
}

// Game status
export type GameStatus =
  | "waiting"
  | "starting"
  | "playing"
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

// Gameplay state - the JSON stored in game.gameState column
export interface GameplayState {
  bankPiles: Pile[];
  currentTurn: number;
}

// Full game state - complete state sent to clients
export interface GameState extends GameListing {
  hostId: string;
  players: Player[];
  bankPiles: Pile[];
  currentRound: number;
  currentTurn: string;
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

// Snapshot types
export interface GameSnapshot {
  id: string;
  gameId: string;
  round: number;
  state: GameState;
  createdAt: Date;
}
