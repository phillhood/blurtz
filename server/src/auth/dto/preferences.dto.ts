import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import type { CardSkin } from "@blurtz/shared";

export class UpdatePreferencesDto {
  @ApiProperty({ enum: ["solid", "emissive"], example: "emissive" })
  @IsIn(["solid", "emissive"])
  cardSkin: CardSkin;
}
