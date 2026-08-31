import { CardColor } from "./types";

export const CARD_COLORS: Record<string, CardColor> = {
  RED: { name: "Red", type: "a" },
  BLUE: { name: "Blue", type: "a" },
  YELLOW: { name: "Yellow", type: "b" },
  GREEN: { name: "Green", type: "b" },
};

export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const WORK_PILE_MAPPING: Record<number, number> = {
  2: 5,
  3: 4,
  4: 3,
} as const;

export const GAME_CONSTANTS = {
  MAX_PLAYERS: 4,
  MIN_PLAYERS: 2,
  BLURTZ_PILE_SIZE: 10,
  WORK_PILE_COUNT: WORK_PILE_MAPPING,
  DRAW_PILE_SIZE: 30,
  BANK_PILE_COUNT: 16,
  // A round scores bankPileCount - 2 * blurtzRemaining, so a good round nets
  // roughly 10-25: below MIN the first decent round ends the game before anyone
  // plays a second, and above MAX it never ends.
  MIN_TARGET_SCORE: 10,
  MAX_TARGET_SCORE: 500,
  // Must stay equal to Game.targetScore's schema default.
  DEFAULT_TARGET_SCORE: 100,
  // How long a `round_over` game waits for the whole table to ready up before
  // the players who have not are forfeited. It is one click on a scoreboard, so
  // this is generous - and a player wrongly forfeited cannot be put back.
  //
  // Shared because it is protocol: the client may count it down. How OFTEN the
  // server checks is not protocol and lives in the server.
  ROUND_OVER_TIMEOUT_MS: 90_000,
} as const;

/**
 * The socket protocol, as one list both sides read.
 *
 * The legacy names are deliberate: the wire says `call_blitz`/`blitz_called`
 * because that is what both sides deployed. Renaming them is a protocol change,
 * not a tidy-up.
 */
export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: "join_game",
  LEAVE_ROOM: "leave_game",
  FORFEIT_GAME: "forfeit_game",
  CREATE_ROOM: "create_game",
  START_GAME: "start_game",
  MOVE_CARD: "move_card",
  FLIP_CARD: "flip_card",
  CALL_BLITZ: "call_blitz",
  PLAYER_READY: "player_ready",

  // Server -> Client
  ROOM_JOINED: "game_joined",
  ROOM_LEFT: "game_left",
  ROOM_CREATED: "game_created",
  GAME_STARTED: "game_started",
  // A Blitz was scored but nobody reached targetScore: the round is over and
  // the next one is waiting on everybody to ready up.
  ROUND_OVER: "round_over",
  GAME_STATE_UPDATED: "game_state_updated",
  CARD_MOVED: "card_moved",
  // Sent only to the player whose move was refused, and always with state: the
  // mover needs an object to reconcile against or the card they moved stays
  // hidden.
  MOVE_REJECTED: "move_rejected",
  CARD_FLIPPED: "card_flipped",
  BLITZ_CALLED: "blitz_called",
  GAME_ENDED: "game_ended",
  ERROR: "error",
  PLAYER_JOINED: "player_joined",
  // A genuine departure: the Player row is gone. A dropped socket does NOT send
  // this - it sends PRESENCE_UPDATED, because the player has not left.
  PLAYER_LEFT: "player_left",
  // Who is currently holding a socket in the room. Connection state, not game
  // state: it is never part of GameState and carries no cards.
  PRESENCE_UPDATED: "presence_updated",
} as const;

// There is deliberately no API_ENDPOINTS here: the game routes live in
// `game.controller.ts` and `client/src/services/game.service.ts` calls them
// directly. A shared constant that disagrees with the controller is worse than
// no constant.
