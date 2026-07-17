/**
 * Why a socket operation failed, as one list both sides read.
 *
 * The client decides what a failure MEANS from `code` alone. A `message` is for
 * a human to read; parsing one is how a routine failure ends up ejecting a
 * player from a game they are still in.
 */
export const SOCKET_ERROR_CODES = {
  /** The game does not exist. */
  GAME_NOT_FOUND: "GAME_NOT_FOUND",
  /**
   * The membership gate refused the caller. Distinct from PLAYER_NOT_FOUND: this
   * is an answer, not a race - the database was asked and said no.
   */
  NOT_A_PLAYER: "NOT_A_PLAYER",
  /**
   * A mutation could not find a player row the membership gate had already
   * accepted, so something moved underneath it. Transient by construction.
   */
  PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
  /** The payload failed DTO validation. */
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  /** The socket carries no verified identity. */
  UNAUTHENTICATED: "UNAUTHENTICATED",
  /** A failure that carries no code of its own. */
  UNKNOWN: "UNKNOWN",
} as const;

export type SocketErrorCode =
  (typeof SOCKET_ERROR_CODES)[keyof typeof SOCKET_ERROR_CODES];

const DECLARED_CODES: readonly string[] = Object.values(SOCKET_ERROR_CODES);

/**
 * Narrows an arbitrary value to a declared code. The gateway runs every code
 * through this, so "the ERROR event's `code` is a SocketErrorCode" is a fact
 * rather than a hope.
 */
export const isSocketErrorCode = (value: unknown): value is SocketErrorCode =>
  typeof value === "string" && DECLARED_CODES.includes(value);
