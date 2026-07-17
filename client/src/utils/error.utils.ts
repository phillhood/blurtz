import { SOCKET_ERROR_CODES, SocketErrorCode } from "@blurtz/shared";

/**
 * The only failures worth ejecting a player from the board for: the game is
 * gone, or they are genuinely not in it.
 *
 * Listing the fatal codes rather than the transient ones is the whole point. A
 * code this client has never heard of - a newer server, a path added tomorrow -
 * falls through to a toast, because guessing "fatal" about a failure you do not
 * recognise throws people out of games they are still playing.
 */
const FATAL_ERROR_CODES: readonly SocketErrorCode[] = [
  SOCKET_ERROR_CODES.GAME_NOT_FOUND,
  SOCKET_ERROR_CODES.NOT_A_PLAYER,
];

export const isFatalErrorCode = (code: string | null | undefined): boolean =>
  FATAL_ERROR_CODES.some((fatal) => fatal === code);
