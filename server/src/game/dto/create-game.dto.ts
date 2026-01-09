import { IsString, IsNumber, IsBoolean, MinLength, MaxLength, Min, Max } from "class-validator";

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
}
