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
import { Interval } from "@nestjs/schedule";
import { Server, Socket } from "socket.io";
import { GameService } from "./game.service";
// Shared with the client, which is what makes "the client listens for the name
// the server emits" a compile-time fact rather than two copies to keep in step.
import { toClientGameState, SOCKET_EVENTS, SOCKET_ERROR_CODES } from "@blurtz/shared";
import { validateWsPayload } from "@utils";
import { getErrorMessage, getErrorCode } from "@utils/error-handler";
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
 * How often the round-over deadline is swept for. NOT the deadline itself
 * (`GAME_CONSTANTS.ROUND_OVER_TIMEOUT_MS`, which is shared because the client
 * may count it down) - it is only the resolution the deadline is noticed at, so
 * a timeout lands somewhere in [90s, 90s + this]. Server-local: how often we
 * poll is nobody else's business.
 */
const ROUND_OVER_SWEEP_MS = 10000;

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

/**
 * `pingInterval`/`pingTimeout` are what decide how long a drop stays invisible.
 *
 * A player who loses their network sends no FIN - the socket just goes quiet -
 * so the heartbeat is the ONLY thing that notices, and presence cannot be
 * broadcast until it does. Engine.IO's defaults (25s + 20s) put that at 45
 * seconds, which is most of a Nertz round: the opponents would spend it
 * watching a live board that nobody is behind.
 *
 * 10s + 10s bounds it at 20. Lower detects faster but starts calling a briefly
 * throttled background tab dead, and a false drop is worse than a slow one.
 */
@WebSocketGateway({
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3030"],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 10000,
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
   * Read a game's state, redacted and ready to emit.
   *
   * Every handler below binds state through this method or through
   * `toClientGameState` on a mutator's return, so the local variable an emission
   * closes over is ALREADY redacted - there is no unredacted state in scope to
   * leak by accident. State is redacted at birth in this file, not on its way
   * out.
   *
   * `GameService` returns internal state with every face-down card's value
   * intact, deliberately - it is the game's own view of itself. This gateway is
   * the boundary where that stops being true.
   */
  private async clientGameState(gameId: string) {
    return toClientGameState(await this.gameService.getGameState(gameId));
  }

  /**
   * Who is holding a socket in `gameId`, right now.
   *
   * Presence is DERIVED from room membership rather than stored: a column would
   * need cleaning up after a crash and would lie after a restart, and an
   * in-memory map would be wrong the moment a second instance existed. The Redis
   * adapter makes `fetchSockets()` span every instance, so the room is already
   * the answer.
   *
   * Deduplicated: two tabs are one player.
   */
  private async connectedUserIds(gameId: string): Promise<string[]> {
    const sockets = await this.server.in(gameId).fetchSockets();
    const userIds = sockets
      .map((socket) => (socket.data as SocketData).userId)
      .filter((userId) => Boolean(userId));

    return [...new Set(userIds)];
  }

  /**
   * Tell the room who is connected - the whole set, never a delta. It is at most
   * four ids, and a set that arrives late still corrects itself where a missed
   * delta stays wrong forever.
   */
  private async broadcastPresence(gameId: string) {
    this.server.to(gameId).emit(SOCKET_EVENTS.PRESENCE_UPDATED, {
      gameId,
      connectedUserIds: await this.connectedUserIds(gameId),
      timestamp: new Date(),
    });
  }

  /**
   * Resolve every `round_over` game that has run out its ready-up deadline.
   *
   * A poll, not a `setTimeout` per game, and both halves of that are the point.
   * An in-process timer dies with the process - leaving the frozen table this
   * exists to unfreeze frozen forever, which is the very bug - and it would fire
   * once per INSTANCE. The deadline is read back off the database instead, so a
   * restart resumes it, and `withGameLock` makes a second instance's sweep
   * block, re-read, and find nothing left to do.
   *
   * It lives on the gateway because its only output is a broadcast. Nobody made
   * a request, so there is no handler to hand state back to: `this.server` -
   * which the Redis adapter makes span every instance - is how the table finds
   * out its round moved on without it. State is redacted here like everywhere
   * else in this file.
   */
  @Interval(ROUND_OVER_SWEEP_MS)
  async sweepRoundOverTimeouts() {
    let gameIds: string[];

    try {
      gameIds = await this.gameService.findTimedOutRoundOverGames();
    } catch (error) {
      this.logger.warn(`Round-over sweep failed: ${getErrorMessage(error)}`);
      return;
    }

    for (const gameId of gameIds) {
      try {
        const state = await this.gameService.resolveRoundOverTimeout(gameId);

        // Null is the normal outcome of losing the race: another instance
        // resolved it, or the table readied up under the lock. Nothing happened,
        // so nothing is announced.
        if (!state) {
          continue;
        }

        const gameState = toClientGameState(state);

        this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STATE_UPDATED, {
          gameState,
          timestamp: new Date(),
        });

        if (gameState.status === "finished") {
          this.server.to(gameId).emit(SOCKET_EVENTS.GAME_ENDED, {
            gameState,
            reason: "timeout",
            winner: gameState.players.find((p) => p.id === gameState.winner),
            timestamp: new Date(),
          });
        }
      } catch (error) {
        // One wedged game must not stop the sweep resolving every other one.
        this.logger.warn(
          `Round-over timeout for game ${gameId} failed: ${getErrorMessage(error)}`
        );
      }
    }
  }

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

  /**
   * A drop, not a departure. The Player row survives and `joinGame` returns
   * early for an existing player, so the same user rejoins and plays on - which
   * is why this emits PRESENCE_UPDATED and NOT `PLAYER_LEFT`: nobody left, and
   * saying they did would end their game for every other client.
   *
   * Socket.IO removes a socket from its rooms before it fires `disconnect`, so
   * the set read here already excludes this one.
   */
  async handleDisconnect(client: Socket) {
    const { userId, gameId } = client.data as SocketData;

    if (gameId && userId) {
      this.logger.log(`Socket disconnected: user ${userId} from game ${gameId}`);
      await this.broadcastPresence(gameId);
    }
  }

  /**
   * The authenticated user id for this socket. Sockets that failed
   * authentication are disconnected at connect, so this is defensive.
   */
  private requireUserId(client: Socket): string {
    const { userId } = client.data as SocketData;

    if (!userId) {
      throw new UnauthorizedException({
        code: SOCKET_ERROR_CODES.UNAUTHENTICATED,
        message: "Not authenticated",
      });
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
      throw new ForbiddenException({
        code: SOCKET_ERROR_CODES.NOT_A_PLAYER,
        message: "You are not a player in this game",
      });
    }

    return playerId;
  }

  /**
   * Report a failed operation to the socket that caused it.
   *
   * `code` is what the client branches on; `message` is only ever displayed. The
   * two must not swap roles - a client that reads meaning out of a message is
   * one server-side rename away from ejecting a player mid-game.
   */
  private emitError(client: Socket, context: string, error: unknown) {
    this.logger.warn(`${context}: ${getErrorMessage(error)}`);
    client.emit(SOCKET_EVENTS.ERROR, {
      code: getErrorCode(error),
      message: getErrorMessage(error),
      timestamp: new Date(),
    });
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

      // One socket survives navigation between games. Staying in the old room
      // would keep delivering that game's broadcasts, and the client swaps
      // `gameState` wholesale on every one - so the abandoned game would
      // overwrite the board of the game actually on screen.
      const previousGameId = (client.data as SocketData).gameId;
      const movedRooms = previousGameId && previousGameId !== gameId;
      if (movedRooms) {
        await client.leave(previousGameId);
      }

      await client.join(gameId);
      (client.data as SocketData).gameId = gameId;

      if (movedRooms) {
        await this.broadcastPresence(previousGameId);
      }

      const gameState = await this.clientGameState(gameId);

      client.emit(SOCKET_EVENTS.ROOM_JOINED, {
        gameState,
        timestamp: new Date(),
      });

      client.to(gameId).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        userId,
        gameState,
        timestamp: new Date(),
      });

      // To the room, which now includes this socket: the joiner needs the
      // CURRENT set, not only the changes that happen after it arrives.
      await this.broadcastPresence(gameId);
    } catch (error) {
      this.emitError(client, "Join room failed", error);
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
        const updatedGameState = await this.clientGameState(gameId);

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
      this.emitError(client, "Leave room failed", error);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.START_GAME)
  async handleStartGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(StartGameDto, data);
      const userId = this.requireUserId(client);
      await this.requirePlayerId(client, gameId);

      // The deal, so the single biggest thing redaction protects: unredacted,
      // GAME_STARTED hands every player every opponent's whole shuffled deck.
      const gameState = toClientGameState(
        await this.gameService.startGame(gameId, userId)
      );

      this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STARTED, {
        gameState,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emitError(client, "Start game failed", error);
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

      // The state comes back from the move itself, read inside the same
      // transaction that made it: going back to the service for it would race the
      // next player's move and could broadcast a state this move never produced.
      const result = await this.gameService.moveCard(
        gameId,
        playerId,
        cardId,
        fromPileId,
        toPileId
      );

      // `=== false` rather than `!result.ok`: this project compiles with
      // strictNullChecks off, and without it TypeScript will not narrow a union
      // by a boolean discriminant's truthiness - only by comparison.
      //
      // `result.state` is internal state. Both branches redact it: a rejection
      // goes to one socket rather than the room, which makes it no less of a
      // broadcast of everyone else's cards.
      if (result.ok === false) {
        // Only the mover hears about this - the board did not change for anyone
        // else. The state is what lets them un-hide the card they moved; a bare
        // ERROR would leave it invisible on the pile it never left.
        client.emit(SOCKET_EVENTS.MOVE_REJECTED, {
          gameState: toClientGameState(result.state),
          reason: result.reason,
          move: { cardId, fromPileId, toPileId, playerId },
          timestamp: new Date(),
        });
      } else {
        this.server.to(gameId).emit(SOCKET_EVENTS.CARD_MOVED, {
          gameState: toClientGameState(result.state),
          move: { cardId, fromPileId, toPileId, playerId },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.emitError(client, "Move card failed", error);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.FLIP_CARD)
  async handleFlipCard(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId, pileId } = await validateWsPayload(FlipCardDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

      await this.gameService.flipDrawPile(gameId, playerId);

      const gameState = await this.clientGameState(gameId);

      this.server.to(gameId).emit(SOCKET_EVENTS.CARD_FLIPPED, {
        gameState,
        flip: { pileId, playerId },
        timestamp: new Date(),
      });
    } catch (error) {
      this.emitError(client, "Flip card failed", error);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_BLITZ)
  async handleCallBlitz(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(CallBlitzDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

      const result = await this.gameService.callBlitz(gameId, playerId);

      // Read inside the transaction that scored it, not re-read here: a re-read
      // would race the round advance and could broadcast a board this Blitz never
      // produced. Redacted once; both emissions below close over the redacted
      // value, so there is no unredacted state in scope to leak.
      const gameState = toClientGameState(result.state);

      // `scores` is cumulative, `roundScores` is this round alone - the
      // scoreboard needs both.
      this.server.to(gameId).emit(SOCKET_EVENTS.BLITZ_CALLED, {
        playerId,
        scores: result.scores,
        roundScores: result.roundScores,
        round: result.round,
        timestamp: new Date(),
      });

      if (result.status === "finished") {
        this.server.to(gameId).emit(SOCKET_EVENTS.GAME_ENDED, {
          gameState,
          reason: "blitz",
          winnerId: result.winnerId,
          scores: result.scores,
          calledBy: playerId,
          timestamp: new Date(),
        });
      } else {
        // Nobody reached the target: the round is over, not the game. The last
        // ready-up deals the next round, and that `playing` state reaches
        // everyone over `handlePlayerReady`'s GAME_STATE_UPDATED.
        this.server.to(gameId).emit(SOCKET_EVENTS.ROUND_OVER, {
          gameState,
          round: result.round,
          scores: result.scores,
          roundScores: result.roundScores,
          calledBy: playerId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.emitError(client, "Call blitz failed", error);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.PLAYER_READY)
  async handlePlayerReady(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId, isReady } = await validateWsPayload(PlayerReadyDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

      // Between rounds the last ready-up also deals the next round inside
      // `setPlayerReady`, so a plain readiness change and a freshly-dealt
      // `playing` board both reach every client through this one
      // GAME_STATE_UPDATED - redacted at birth, so the new decks do not leak.
      await this.gameService.setPlayerReady(gameId, playerId, isReady);

      const gameState = await this.clientGameState(gameId);
      this.server.to(gameId).emit(SOCKET_EVENTS.GAME_STATE_UPDATED, {
        gameState,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emitError(client, "Player ready failed", error);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.FORFEIT_GAME)
  async handleForfeitGame(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    try {
      const { gameId } = await validateWsPayload(ForfeitGameDto, data);
      const playerId = await this.requirePlayerId(client, gameId);

      const gameState = toClientGameState(
        await this.gameService.forfeitGame(gameId, playerId)
      );

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
      this.emitError(client, "Forfeit game failed", error);
    }
  }
}
