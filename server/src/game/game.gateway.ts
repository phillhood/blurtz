import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { GameService } from "./game.service";
import { SOCKET_EVENTS, validateWsPayload } from "@utils";
import { getErrorMessage } from "@utils/error-handler";
import {
  JoinRoomDto,
  LeaveRoomDto,
  StartGameDto,
  MoveCardDto,
  FlipCardDto,
  CallBlitzDto,
  PlayerReadyDto,
  ForfeitGameDto,
} from "./dto";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  gameId?: string;
}

@WebSocketGateway({
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3030"],
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  // socketId -> userId
  private connectedUsers = new Map<string, string>();

  constructor(private gameService: GameService) {}

  handleConnection(_client: AuthenticatedSocket) {}

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.gameId && client.userId) {
      this.logger.log(`Socket disconnected: user ${client.userId} from game ${client.gameId}`);
      client.leave(client.gameId);

      this.server.to(client.gameId).emit(SOCKET_EVENTS.PLAYER_LEFT, {
        userId: client.userId,
        timestamp: new Date(),
      });
    }

    this.connectedUsers.delete(client.id);
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_ROOM)
  async handleJoinGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, userId } = await validateWsPayload(JoinRoomDto, data);

      client.userId = userId;
      client.gameId = gameId;
      this.connectedUsers.set(client.id, userId);

      await client.join(gameId);
      await this.gameService.joinGame(gameId, userId);

      const gameState = await this.gameService.getGameState(gameId);

      client.emit(SOCKET_EVENTS.ROOM_JOINED, {
        gameState,
        timestamp: new Date(),
      });

      client.to(gameId).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId,
        gameState,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Join room failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_ROOM)
  async handleLeaveGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, userId } = await validateWsPayload(LeaveRoomDto, data);

      await client.leave(gameId);
      await this.gameService.leaveGame(gameId, userId);

      client.userId = undefined;
      client.gameId = undefined;

      client.emit(SOCKET_EVENTS.ROOM_LEFT, {
        gameId,
        timestamp: new Date(),
      });

      try {
        const updatedGameState = await this.gameService.getGameState(gameId);

        client.to(gameId).emit(SOCKET_EVENTS.PLAYER_LEFT, {
          userId,
          gameState: updatedGameState,
          timestamp: new Date(),
        });
      } catch {
        client.to(gameId).emit(SOCKET_EVENTS.PLAYER_LEFT, {
          userId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.warn(`Leave room failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.START_GAME)
  async handleStartGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId } = await validateWsPayload(StartGameDto, data);

      const gameState = await this.gameService.startGame(gameId);

      this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STARTED, {
        gameState,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Start game failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.MOVE_CARD)
  async handleMoveCard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, playerId, cardId, fromPileId, toPileId } =
        await validateWsPayload(MoveCardDto, data);

      const success = await this.gameService.moveCard(
        gameId,
        playerId,
        cardId,
        fromPileId,
        toPileId
      );

      if (success) {
        const gameState = await this.gameService.getGameState(gameId);

        this.server.to(gameId).emit(SOCKET_EVENTS.CARD_MOVED, {
          gameState,
          move: { cardId, fromPileId, toPileId, playerId },
          timestamp: new Date(),
        });
      } else {
        client.emit(SOCKET_EVENTS.ERROR, {
          message: "Invalid move",
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.warn(`Move card failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.FLIP_CARD)
  async handleFlipCard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, playerId, pileId } = await validateWsPayload(
        FlipCardDto,
        data
      );

      await this.gameService.flipDrawPile(gameId, playerId);

      const gameState = await this.gameService.getGameState(gameId);

      this.server.to(gameId).emit(SOCKET_EVENTS.CARD_FLIPPED, {
        gameState,
        flip: { pileId, playerId },
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Flip card failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_BLITZ)
  async handleCallBlitz(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, playerId } = await validateWsPayload(CallBlitzDto, data);

      // Validate Blitz call and calculate scores
      const result = await this.gameService.callBlitz(gameId, playerId);

      if (result.success) {
        const gameState = await this.gameService.getGameState(gameId);

        // Notify all players that Blitz was called
        this.server.to(gameId).emit(SOCKET_EVENTS.BLITZ_CALLED, {
          playerId,
          scores: result.scores,
          timestamp: new Date(),
        });

        // End the game
        this.server.to(gameId).emit(SOCKET_EVENTS.GAME_ENDED, {
          gameState,
          reason: "blitz",
          winnerId: result.winnerId,
          scores: result.scores,
          calledBy: playerId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.warn(`Call blitz failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.PLAYER_READY)
  async handlePlayerReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, playerId, isReady } = await validateWsPayload(
        PlayerReadyDto,
        data
      );
      await this.gameService.setPlayerReady(gameId, playerId, isReady);

      const gameState = await this.gameService.getGameState(gameId);
      this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STATE_UPDATED, {
        gameState,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Player ready failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.FORFEIT_GAME)
  async handleForfeitGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown
  ) {
    try {
      const { gameId, playerId } = await validateWsPayload(
        ForfeitGameDto,
        data
      );

      const gameState = await this.gameService.forfeitGame(gameId, playerId);

      this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STATE_UPDATED, {
        gameState,
        timestamp: new Date(),
      });

      if (gameState.status === "finished") {
        this.server.to(gameId).emit(SOCKET_EVENTS.GAME_ENDED, {
          gameState,
          reason: "forfeit",
          winner: gameState.players.find((p) => p.id === gameState.winner),
          timestamp: new Date(),
        });
      }

      client.leave(gameId);
      client.emit(SOCKET_EVENTS.ROOM_LEFT, {
        gameId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Forfeit game failed: ${getErrorMessage(error)}`);
      client.emit(SOCKET_EVENTS.ERROR, {
        message: getErrorMessage(error),
        timestamp: new Date(),
      });
    }
  }
}
