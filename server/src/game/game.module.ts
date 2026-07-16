import { Module } from "@nestjs/common";
import { AuthModule } from "@auth/auth.module";
import { UserModule } from "@user/user.module";
import { GameController } from "./game.controller";
import { GameService } from "./game.service";
import { GameGateway } from "./game.gateway";
import { GameRepository } from "./game.repository";

// UserModule is imported for UserService: finishing a game is what finally
// increments gamesPlayed/gamesWon, and GameService is the only thing that
// knows a game has finished.
@Module({
  imports: [AuthModule, UserModule],
  controllers: [GameController],
  providers: [GameService, GameGateway, GameRepository],
  exports: [GameService],
})
export class GameModule {}
