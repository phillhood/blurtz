import { CardColor } from "@types";

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
  GAME_STATE_UPDATED: "game_state_updated",
  CARD_MOVED: "card_moved",
  // Sent only to the player whose move was refused, and always with state:
  // nothing changed for anyone else, but the mover needs an object to
  // reconcile against or the card they moved stays hidden.
  // Keep in sync with client/src/utils/constants.utils.ts.
  MOVE_REJECTED: "move_rejected",
  CARD_FLIPPED: "card_flipped",
  BLITZ_CALLED: "blitz_called",
  GAME_ENDED: "game_ended",
  ERROR: "error",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT: "player_left",
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/api/auth/login",
    REGISTER: "/api/auth/register",
    LOGOUT: "/api/auth/logout",
    PROFILE: "/api/auth/profile",
  },
  GAME: {
    ROOMS: "/api/game/games",
    CREATE_ROOM: "/api/game/games",
    JOIN_ROOM: "/api/game/games/:id/join",
    LEAVE_ROOM: "/api/game/games/:id/leave",
  },
  USER: {
    PROFILE: "/api/user/profile",
    STATS: "/api/user/stats",
  },
} as const;

// PILE_RULES used to live here: an untyped `canPlace` pair, plus a `canTake`
// and a `canFlip` that both unconditionally returned true. The real rules are
// now `canPlace` / `canMoveFromPile` in `src/game/rules/engine.ts`, where they
// are typed, tested, and next to the rest of the engine.
