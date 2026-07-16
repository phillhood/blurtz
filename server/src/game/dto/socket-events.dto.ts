import { IsString, IsUUID, IsBoolean } from "class-validator";
import {
  CallBlitzPayload,
  FlipCardPayload,
  ForfeitGamePayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  MoveCardPayload,
  PlayerReadyPayload,
  StartGamePayload,
} from "@blurtz/shared";

/**
 * The inbound socket payloads, as validated classes.
 *
 * Classes rather than the shared interfaces because an interface does not
 * survive compilation, and these payloads arrive from the network: something
 * has to exist at RUNTIME to check them, which is what class-validator and
 * `validateWsPayload` are for. That is not a duplication the shared package
 * could absorb.
 *
 * Each one `implements` its shared payload type, which costs nothing and buys
 * the coupling: a DTO that drifts from the payload the client emits stops
 * compiling here, rather than silently rejecting every message in production.
 */

export class JoinRoomDto implements JoinRoomPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}

export class LeaveRoomDto implements LeaveRoomPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}

export class StartGameDto implements StartGamePayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}

export class MoveCardDto implements MoveCardPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid card ID format" })
  cardId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid source pile ID format" })
  fromPileId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid target pile ID format" })
  toPileId: string;
}

export class FlipCardDto implements FlipCardPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid pile ID format" })
  pileId: string;
}

export class CallBlitzDto implements CallBlitzPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}

export class PlayerReadyDto implements PlayerReadyPayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsBoolean()
  isReady: boolean;
}

export class ForfeitGameDto implements ForfeitGamePayload {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}
