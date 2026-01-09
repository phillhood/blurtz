import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { GameService } from "./game.service";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";
import { ApiResponse } from "@types";
import { getErrorMessage } from "@utils/error-handler";
import { CreateGameDto, JoinGameByIdDto, JoinGameByCodeDto, GameIdParamDto } from "./dto";

@ApiTags("game")
@ApiBearerAuth()
@Controller("game")
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private gameService: GameService) {}

  @Get("listings")
  @ApiOperation({ summary: "Get available games to join" })
  @SwaggerResponse({ status: 200, description: "List of available games" })
  async getGames(): Promise<ApiResponse> {
    try {
      const games = await this.gameService.getAvailableGames();
      return {
        success: true,
        data: games,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Get("active")
  @ApiOperation({ summary: "Get games the current user is participating in" })
  @SwaggerResponse({ status: 200, description: "List of active games for user" })
  async getActiveGames(@Request() req): Promise<ApiResponse> {
    try {
      const userId = req.user.sub;
      const games = await this.gameService.getActiveGames(userId);
      return {
        success: true,
        data: games,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Post()
  @ApiOperation({ summary: "Create a new game" })
  @SwaggerResponse({ status: 201, description: "Game created successfully" })
  @SwaggerResponse({ status: 400, description: "Bad request" })
  async createGame(
    @Body() createGameDto: CreateGameDto,
    @Request() req
  ): Promise<ApiResponse> {
    try {
      const { name, maxPlayers, isPrivate } = createGameDto;
      const game = await this.gameService.createGame(
        name,
        req.user.sub,
        maxPlayers,
        isPrivate
      );
      return {
        success: true,
        data: game,
        message: "Game created successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Post("joinById")
  @ApiOperation({ summary: "Join a game by its ID" })
  @SwaggerResponse({ status: 200, description: "Joined game successfully" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async JoinById(
    @Body() joinGameDto: JoinGameByIdDto,
    @Request() req
  ): Promise<ApiResponse> {
    try {
      const userId = req.user.sub;
      const { id } = joinGameDto;
      const game = await this.gameService.joinGame(id, userId);
      return {
        success: true,
        message: `Joined game with id ${id} successfully`,
        data: game,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Post("joinByCode")
  @ApiOperation({ summary: "Join a game by its invite code" })
  @SwaggerResponse({ status: 200, description: "Joined game successfully" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async JoinByCode(
    @Body() joinGameDto: JoinGameByCodeDto,
    @Request() req
  ): Promise<ApiResponse> {
    try {
      const userId = req.user.sub;
      const { alias } = joinGameDto;
      const game = await this.gameService.findGameByAlias(alias);
      if (!game) {
        throw new NotFoundException(`Game with alias ${alias} not found`);
      }
      await this.gameService.joinGame(game.id, userId);
      return {
        success: true,
        message: `Joined game with alias ${alias} successfully`,
        data: game,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Delete(":id/leave")
  @ApiOperation({ summary: "Leave a game" })
  @SwaggerResponse({ status: 200, description: "Left game successfully" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async leaveGame(
    @Param() params: GameIdParamDto,
    @Request() req
  ): Promise<ApiResponse> {
    const { id: gameId } = params;
    try {
      await this.gameService.leaveGame(gameId, req.user.sub);
      return {
        success: true,
        message: "Left game successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Post(":id/start")
  @ApiOperation({ summary: "Start a game" })
  @SwaggerResponse({ status: 200, description: "Game started successfully" })
  @SwaggerResponse({ status: 400, description: "Cannot start game" })
  async startGame(@Param() params: GameIdParamDto): Promise<ApiResponse> {
    const { id: gameId } = params;
    try {
      const gameState = await this.gameService.startGame(gameId);
      return {
        success: true,
        data: gameState,
        message: "Game started successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Get(":id/state")
  @ApiOperation({ summary: "Get current game state" })
  @SwaggerResponse({ status: 200, description: "Game state retrieved" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async getGameState(@Param() params: GameIdParamDto): Promise<ApiResponse> {
    const { id: gameId } = params;
    try {
      const gameState = await this.gameService.getGameState(gameId);
      return {
        success: true,
        data: gameState,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Get(":id/snapshots")
  @ApiOperation({ summary: "Get game state snapshots" })
  @SwaggerResponse({ status: 200, description: "Snapshots retrieved" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async getSnapshots(@Param() params: GameIdParamDto): Promise<ApiResponse> {
    const { id: gameId } = params;
    try {
      const snapshots = await this.gameService.getSnapshots(gameId);
      return {
        success: true,
        data: snapshots,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  @Get(":id/snapshots/latest")
  @ApiOperation({ summary: "Get latest game snapshot" })
  @SwaggerResponse({ status: 200, description: "Latest snapshot retrieved" })
  @SwaggerResponse({ status: 404, description: "Game or snapshot not found" })
  async getLatestSnapshot(@Param() params: GameIdParamDto): Promise<ApiResponse> {
    const { id: gameId } = params;
    try {
      const snapshot = await this.gameService.getLatestSnapshot(gameId);
      return {
        success: true,
        data: snapshot,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}
