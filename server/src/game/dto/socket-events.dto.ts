import { IsString, IsUUID, IsBoolean } from "class-validator";

export class JoinRoomDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid user ID format" })
  userId: string;
}

export class LeaveRoomDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid user ID format" })
  userId: string;
}

export class StartGameDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;
}

export class MoveCardDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid player ID format" })
  playerId: string;

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

export class FlipCardDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid player ID format" })
  playerId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid pile ID format" })
  pileId: string;
}

export class CallBlitzDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid player ID format" })
  playerId: string;
}

export class PlayerReadyDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid player ID format" })
  playerId: string;

  @IsBoolean()
  isReady: boolean;
}

export class ForfeitGameDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  gameId: string;

  @IsString()
  @IsUUID("4", { message: "Invalid player ID format" })
  playerId: string;
}
