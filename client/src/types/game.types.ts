import { User } from ".";

export type GameStatus =
  | "waiting"
  | "starting"
  | "playing"
  | "paused"
  | "finished";

export interface Game {
  id: string;
  name: string;
  alias: string;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  createdAt: Date;
  updatedAt?: Date;
}
export interface GameState extends Game {
  hostId: string;
  players: Player[];
  bankPiles: Pile[];
  currentRound: number;
  currentTurn: string;
  winner?: string;
}

export interface GameFilters {
  status?: string;
  currentPlayers?: number;
}

export interface GameActions {
  onJoin: (gameId: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}

export interface Card {
  id: string;
  value: number;
  number: number; // Alias for value
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

export interface Player {
  id: string;
  username: string;
  user: User;
  isReady: boolean;
  deck: PlayerDeck;
  score: number;
  bankPileCount: number;
}

export interface PlayerDeck {
  blurtzPile: Pile;
  workPiles: Pile[];
  drawPile: Pile;
}

export type PileType = "blurtz" | "work" | "draw" | "bank";

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
  data: any;
  timestamp: Date;
}

export interface MoveCardEvent {
  cardId: string;
  fromPileId: string;
  toPileId: string;
  fromPosition: number;
  toPosition: number;
}
