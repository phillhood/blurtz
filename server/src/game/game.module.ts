import { Module } from "@nestjs/common";
import { AuthModule } from "@auth/auth.module";
import { GameController } from "./game.controller";
import { GameService } from "./game.service";
import { GameGateway } from "./game.gateway";

@Module({
  imports: [AuthModule],
  controllers: [GameController],
  providers: [GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}
