import { User } from ".";

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
