import { IsString, IsUUID, MinLength, MaxLength } from "class-validator";

export class JoinGameByIdDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  id: string;
}

export class JoinGameByCodeDto {
  @IsString()
  @MinLength(1, { message: "Game code is required" })
  @MaxLength(20, { message: "Game code must be at most 20 characters" })
  alias: string;
}
