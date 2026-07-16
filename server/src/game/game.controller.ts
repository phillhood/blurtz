import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { GameService } from "./game.service";
// Redaction lives in the shared package - see shared/src/index.ts.
import { toClientGameState, SOCKET_ERROR_CODES } from "@blurtz/shared";
import { JwtAuthGuard } from "@auth/guards/jwt-auth.guard";
import { ApiResponse } from "@types";
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
    const games = await this.gameService.getAvailableGames();
    return {
      success: true,
      data: games,
    };
  }

  @Get("active")
  @ApiOperation({ summary: "Get games the current user is participating in" })
  @SwaggerResponse({ status: 200, description: "List of active games for user" })
  async getActiveGames(@Request() req): Promise<ApiResponse> {
    const userId = req.user.sub;
    const games = await this.gameService.getActiveGames(userId);
    return {
      success: true,
      data: games,
    };
  }

  @Post()
  @ApiOperation({ summary: "Create a new game" })
  @SwaggerResponse({ status: 201, description: "Game created successfully" })
  @SwaggerResponse({ status: 400, description: "Bad request" })
  async createGame(
    @Body() createGameDto: CreateGameDto,
    @Request() req
  ): Promise<ApiResponse> {
    const { name, maxPlayers, isPrivate, targetScore } = createGameDto;
    const game = await this.gameService.createGame(
      name,
      req.user.sub,
      maxPlayers,
      isPrivate,
      targetScore
    );
    return {
      success: true,
      data: game,
      message: "Game created successfully",
    };
  }

  @Post("joinById")
  @ApiOperation({ summary: "Join a game by its ID" })
  @SwaggerResponse({ status: 200, description: "Joined game successfully" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async JoinById(
    @Body() joinGameDto: JoinGameByIdDto,
    @Request() req
  ): Promise<ApiResponse> {
    const userId = req.user.sub;
    const { id } = joinGameDto;
    const game = await this.gameService.joinGame(id, userId);
    return {
      success: true,
      message: `Joined game with id ${id} successfully`,
      data: game,
    };
  }

  @Post("joinByCode")
  @ApiOperation({ summary: "Join a game by its invite code" })
  @SwaggerResponse({ status: 200, description: "Joined game successfully" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async JoinByCode(
    @Body() joinGameDto: JoinGameByCodeDto,
    @Request() req
  ): Promise<ApiResponse> {
    const userId = req.user.sub;
    const { alias } = joinGameDto;
    const game = await this.gameService.findGameByAlias(alias);
    if (!game) {
      throw new NotFoundException(`Game with alias ${alias} not found`);
    }
    // Presenting a valid invite code is what grants access to a private game.
    await this.gameService.joinGame(game.id, userId, { allowPrivate: true });
    return {
      success: true,
      message: `Joined game with alias ${alias} successfully`,
      data: game,
    };
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
    await this.gameService.leaveGame(gameId, req.user.sub);
    return {
      success: true,
      message: "Left game successfully",
    };
  }

  @Post(":id/start")
  @ApiOperation({ summary: "Start a game" })
  @SwaggerResponse({ status: 200, description: "Game started successfully" })
  @SwaggerResponse({ status: 400, description: "Cannot start game" })
  async startGame(
    @Param() params: GameIdParamDto,
    @Request() req
  ): Promise<ApiResponse> {
    const { id: gameId } = params;
    // Redacted like every other outbound path. `startGame` is host-only, so
    // there is no membership hole here - but the host is not entitled to the
    // deal either, and this returns the freshly-shuffled decks.
    const gameState = await this.gameService.startGame(gameId, req.user.sub);
    return {
      success: true,
      data: toClientGameState(gameState),
      message: "Game started successfully",
    };
  }

  /**
   * The REST mirror of the socket path the client actually plays through.
   *
   * `JwtAuthGuard` proves you are SOMEBODY; it does not prove you are somebody in
   * THIS game. Without both halves below - the membership check, and redacting
   * what a member gets back exactly like a broadcast - any logged-in user who
   * could name a game id would get the full deal, face-down cards included.
   */
  @Get(":id/state")
  @ApiOperation({ summary: "Get current game state" })
  @SwaggerResponse({ status: 200, description: "Game state retrieved" })
  @SwaggerResponse({ status: 403, description: "Not a player in this game" })
  @SwaggerResponse({ status: 404, description: "Game not found" })
  async getGameState(
    @Param() params: GameIdParamDto,
    @Request() req
  ): Promise<ApiResponse> {
    const { id: gameId } = params;

    // Membership is resolved BEFORE the game is read, which also means a game
    // that does not exist and a game you are not in answer identically: 403
    // either way, so this route cannot be used to probe which ids are real.
    const playerId = await this.gameService.getPlayerIdForUser(
      gameId,
      req.user.sub
    );
    if (!playerId) {
      throw new ForbiddenException({
        code: SOCKET_ERROR_CODES.NOT_A_PLAYER,
        message: "You are not a player in this game",
      });
    }

    const gameState = await this.gameService.getGameState(gameId);
    return {
      success: true,
      data: toClientGameState(gameState),
    };
  }
}
