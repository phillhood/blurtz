import { CardColor } from "./types";

export const CARD_COLORS: Record<string, CardColor> = {
  RED: { name: "Red", code: "#DC2626", type: "a" },
  BLUE: { name: "Blue", code: "#2563EB", type: "a" },
  YELLOW: { name: "Yellow", code: "#EAB308", type: "b" },
  GREEN: { name: "Green", code: "#16A34A", type: "b" },
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
} as const;

/**
 * The socket protocol, as one list both sides read.
 *
 * This used to be two lists - this one and the client's copy in
 * `utils/constants.utils.ts` - carrying "keep in sync with" comments pointing
 * at each other. They were not in sync: the client's had a
 * `PLAYER_READY_UPDATED` event the server has never emitted and nothing ever
 * listened for. It is gone. Adding an event is one edit now.
 *
 * The legacy names are deliberate: the wire says `call_blitz`/`blitz_called`
 * because that is what both sides deployed. Renaming them is a protocol
 * change, not a tidy-up.
 */
export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: "join_game",
  LEAVE_ROOM: "leave_game",
  FORFEIT_GAME: "forfeit_game",
  CREATE_ROOM: "create_game",
  START_GAME: "start_game",
  // Deal the next round of a `round_over` game. Deliberately NOT START_GAME:
  // the two share a gate (host + everyone ready) but not an outcome - one
  // deals round 1 of a `waiting` game, the other advances an in-progress one
  // and must never be able to re-deal a game that is already `playing`.
  START_NEXT_ROUND: "start_next_round",
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
  // The next round has been dealt. Carries fresh state, like GAME_STARTED.
  ROUND_STARTED: "round_started",
  GAME_STATE_UPDATED: "game_state_updated",
  CARD_MOVED: "card_moved",
  // Sent only to the player whose move was refused, and always with state:
  // nothing changed for anyone else, but the mover needs an object to
  // reconcile against or the card they moved stays hidden.
  MOVE_REJECTED: "move_rejected",
  CARD_FLIPPED: "card_flipped",
  BLITZ_CALLED: "blitz_called",
  GAME_ENDED: "game_ended",
  ERROR: "error",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT: "player_left",
} as const;

// API_ENDPOINTS used to live beside this, in both copies, and both were stale:
// they described routes like `/api/game/games/:id/join` that the server has
// never served. The real routes are the ones in `game.controller.ts`, and
// `client/src/services/game.service.ts` calls them directly. A shared constant
// that disagrees with the controller is worse than no constant, so there is
// none. Trust the controller.

// PILE_RULES used to live here too, as an untyped `canPlace` pair plus a
// `canTake` and a `canFlip` that both unconditionally returned true. The real
// rules are `canPlace` / `canMoveFromPile` in `rules/engine.ts`, where they are
// typed, tested, and next to the rest of the engine.
