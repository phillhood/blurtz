/**
 * The payloads the client sends over the socket, one per inbound event.
 *
 * No `userId`, no `playerId`, ever: the gateway derives identity from the
 * verified JWT on the handshake, never from a payload. Adding an identity field
 * here would be a security regression.
 *
 * The server's DTOs in `server/src/game/dto/socket-events.dto.ts` `implement`
 * these, so a DTO that drifts from the payload fails to compile. Runtime
 * checking is still class-validator's job - these payloads are
 * attacker-controlled and an interface does not survive compilation.
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
