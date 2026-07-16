import {
  IsString,
  IsNumber,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from "class-validator";
import { GAME_CONSTANTS } from "@blurtz/shared";

export class CreateGameDto {
  @IsString()
  @MinLength(1, { message: "Game name is required" })
  @MaxLength(50, { message: "Game name must be at most 50 characters" })
  name: string;

  @IsNumber()
  @Min(2, { message: "Minimum 2 players required" })
  @Max(4, { message: "Maximum 4 players allowed" })
  maxPlayers: number;

  @IsBoolean()
  isPrivate: boolean;

  // Omitting the field is how a caller asks for the default, so only a value
  // that is actually present is validated. `@IsOptional` would wave `null`
  // through as well, and Prisma rejects null for a non-nullable column.
  @ValidateIf((dto: CreateGameDto) => dto.targetScore !== undefined)
  @IsInt({ message: "Target score must be a whole number" })
  @Min(GAME_CONSTANTS.MIN_TARGET_SCORE, {
    message: `Target score must be at least ${GAME_CONSTANTS.MIN_TARGET_SCORE}`,
  })
  @Max(GAME_CONSTANTS.MAX_TARGET_SCORE, {
    message: `Target score must be at most ${GAME_CONSTANTS.MAX_TARGET_SCORE}`,
  })
  targetScore?: number;
}
