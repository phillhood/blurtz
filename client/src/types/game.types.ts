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

/**
 * A card as the server publishes it.
 *
 * The split is face-up vs face-down, NOT self vs opponent: you cannot see your
 * own blurtz pile below its top card, or the face-down part of your own draw
 * pile, so `faceUp` is the whole of what anyone may see. The server redacts on
 * exactly this axis (`server/src/game/rules/redact.ts`) and these types mirror
 * that payload.
 *
 * Because it is a discriminated union and this package is `strict`, reading
 * `.value` off a card you have not established is face-up is a COMPILE ERROR -
 * the server no longer sends it, and the type says so. `Card.tsx`'s
 * `if (!card.faceUp) return <back/>` early return is what narrows the rest of
 * the component to `VisibleCard`.
 */
export interface VisibleCard {
  id: string;
  value: number;
  number: number; // Alias for value
  color: CardColor;
  faceUp: true;
}

/**
 * A face-down card: its existence and position, nothing else.
 *
 * `id` is SYNTHETIC and positional - the server never publishes a hidden
 * card's real id, because cards it has shown face-up can go face-down again on
 * a draw pile reset. It is a React key and a dnd-kit id, and nothing else:
 * a face-down card is never draggable.
 */
export interface HiddenCard {
  id: string;
  faceUp: false;
}

export type ClientCard = VisibleCard | HiddenCard;

export interface CardColor {
  name: string;
  code: string;
  type: "a" | "b";
}

export type CardColorString = string;

export interface Pile {
  id: string;
  type: PileType;
  cards: ClientCard[];
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
