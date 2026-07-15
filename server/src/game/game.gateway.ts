import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { ForbiddenException, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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

/**
 * Per-socket state, stored in Socket.IO's official `data` bag.
 *
 * `userId` is set once, at connect, from the verified JWT. It is the ONLY
 * source of caller identity in this gateway - identity is never read from a
 * message payload, because a payload is attacker-controlled.
 */
interface SocketData {
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

  constructor(
    private gameService: GameService,
    private jwtService: JwtService
  ) {}

  /**
   * Authenticate the handshake. A socket that cannot prove who it is never
   * gets to send a single message.
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake?.auth?.token;

      if (!token || typeof token !== "string") {
        throw new UnauthorizedException("No authentication token provided");
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload?.sub;

      if (!userId) {
        throw new UnauthorizedException("Token payload is missing a subject");
      }

      (client.data as SocketData).userId = userId;
      this.logger.log(`Socket connected: user ${userId} (${client.id})`);
    } catch (error) {
      // Never throw out of handleConnection - just refuse the socket.
      this.logger.warn(
        `Rejected socket ${client.id}: ${getErrorMessage(error)}`
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const { userId, gameId } = client.data as SocketData;

    if (gameId && userId) {
      this.logger.log(`Socket disconnected: user ${userId} from game ${gameId}`);
      client.leave(gameId);

      this.server.to(gameId).emit(SOCKET_EVENTS.PLAYER_LEFT, {
        userId,
        timestamp: new Date(),
      });
    }
  }

  /**
   * The authenticated user id for this socket. Sockets that failed
   * authentication are disconnected at connect, so this is defensive.
   */
  private requireUserId(client: Socket): string {
    const { userId } = client.data as SocketData;

    if (!userId) {
      throw new UnauthorizedException("Not authenticated");
    }

    return userId;
  }

  /**
   * Resolve the caller's Player id in `gameId`, rejecting users who are not
   * players in that game.
   *
   * `gameId` comes from the payload, so membership is always re-checked
   * against the database - `client.data.gameId` is a convenience, not a
   * permission.
   */
  private async requirePlayerId(client: Socket, gameId: string): Promise<string> {
    const userId = this.requireUserId(client);
    const playerId = await this.gameService.getPlayerIdForUser(gameId, userId);

    if (!playerId) {
      throw new ForbiddenException("You are not a player in this game");
    }

    return playerId;
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_ROOM)
  async handleJoinGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(JoinRoomDto, data);
      const userId = this.requireUserId(client);

      // Join the game BEFORE joining the room: if joinGame rejects (full,
      // private, not accepting players) the socket must not end up in the room
      // receiving every broadcast.
      await this.gameService.joinGame(gameId, userId);

      await client.join(gameId);
      (client.data as SocketData).gameId = gameId;

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
  async handleLeaveGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(LeaveRoomDto, data);
      const userId = this.requireUserId(client);
      await this.requirePlayerId(client, gameId);

      await this.gameService.leaveGame(gameId, userId);

      await client.leave(gameId);
      (client.data as SocketData).gameId = undefined;

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
  async handleStartGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(StartGameDto, data);
      const userId = this.requireUserId(client);
      await this.requirePlayerId(client, gameId);

      // The host check and the readiness check live in GameService.startGame.
      const gameState = await this.gameService.startGame(gameId, userId);

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
  async handleMoveCard(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId, cardId, fromPileId, toPileId } = await validateWsPayload(
        MoveCardDto,
        data
      );
      const playerId = await this.requirePlayerId(client, gameId);

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
  async handleFlipCard(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId, pileId } = await validateWsPayload(FlipCardDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

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
  async handleCallBlitz(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(CallBlitzDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

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
  async handlePlayerReady(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId, isReady } = await validateWsPayload(PlayerReadyDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

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
  async handleForfeitGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(ForfeitGameDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

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
      (client.data as SocketData).gameId = undefined;
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
