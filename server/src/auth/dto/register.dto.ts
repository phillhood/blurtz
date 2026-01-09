import { IsString, MinLength, MaxLength, Matches } from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(3, { message: "Username must be at least 3 characters" })
  @MaxLength(20, { message: "Username must be at most 20 characters" })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "Username can only contain letters, numbers, and underscores",
  })
  username: string;

  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters" })
  @MaxLength(100, { message: "Password must be at most 100 characters" })
  password: string;
}
