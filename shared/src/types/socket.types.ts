/**
 * The payloads the client sends over the socket.
 *
 * One shape per inbound event, named after the event. The server's DTOs in
 * `server/src/game/dto/socket-events.dto.ts` `implement` these, which couples
 * the two for free: class-validator still does the runtime checking (an
 * interface cannot - it does not survive compilation, and these payloads are
 * attacker-controlled), but a DTO that stops matching the payload the client
 * actually sends no longer compiles.
 *
 * Note what is NOT here: no `userId`, no `playerId`. The gateway derives
 * identity from the verified JWT on the handshake and never from a payload.
 * Adding an identity field to one of these would be a security regression, and
 * this is the file where that would be obvious.
 */

export interface JoinRoomPayload {
  gameId: string;
}

export interface LeaveRoomPayload {
  gameId: string;
}

export interface StartGamePayload {
  gameId: string;
}

export interface MoveCardPayload {
  gameId: string;
  cardId: string;
  fromPileId: string;
  toPileId: string;
}

export interface FlipCardPayload {
  gameId: string;
  pileId: string;
}

export interface CallBlitzPayload {
  gameId: string;
}

export interface PlayerReadyPayload {
  gameId: string;
  isReady: boolean;
}

export interface ForfeitGamePayload {
  gameId: string;
}
