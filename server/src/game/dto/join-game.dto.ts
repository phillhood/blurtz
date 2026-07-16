import { IsString, IsUUID, MinLength, MaxLength } from "class-validator";
import { MAX_ALIAS_LENGTH } from "@utils";

export class JoinGameByIdDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  id: string;
}

export class JoinGameByCodeDto {
  @IsString()
  @MinLength(1, { message: "Game code is required" })
  @MaxLength(MAX_ALIAS_LENGTH, {
    message: `Game code must be at most ${MAX_ALIAS_LENGTH} characters`,
  })
  alias: string;
}
