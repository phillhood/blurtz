import { IsString, IsUUID } from "class-validator";

export class GameIdParamDto {
  @IsString()
  @IsUUID("4", { message: "Invalid game ID format" })
  id: string;
}
