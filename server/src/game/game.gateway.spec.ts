import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException } from "@nestjs/common";
import { Socket } from "socket.io";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { SOCKET_EVENTS } from "@utils";

// The DTOs validate every id as a v4 UUID, so fixtures must look like one.
const GAME_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_GAME_ID = "99999999-9999-4999-8999-999999999999";
const CARD_ID = "22222222-2222-4222-8222-222222222222";
const FROM_PILE_ID = "33333333-3333-4333-8333-333333333333";
const TO_PILE_ID = "44444444-4444-4444-8444-444444444444";
const PILE_ID = "55555555-5555-4555-8555-555555555555";

// A player id belonging to someone else, used to prove payload-supplied
// identity is never honoured.
const VICTIM_PLAYER_ID = "66666666-6666-4666-8666-666666666666";

const CONNECTED_USER_ID = "user-connected";
const CONNECTED_PLAYER_ID = "player-connected";

interface MockSocket {
  id: string;
  data: { userId?: string; gameId?: string };
  handshake: { auth: Record<string, unknown> };
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  disconnect: jest.Mock;
  to: jest.Mock;
  roomEmit: jest.Mock;
}

function createMockSocket(auth: Record<string, unknown> = {}): MockSocket {
  const roomEmit = jest.fn();
  return {
    id: "socket-1",
    data: {},
    handshake: { auth },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: roomEmit }),
    roomEmit,
  };
}

/** A socket that has already passed handshake authentication. */
function createAuthedSocket(): MockSocket {
  const socket = createMockSocket({ token: "valid-token" });
  socket.data.userId = CONNECTED_USER_ID;
  return socket;
}

function asSocket(socket: MockSocket): Socket {
  return socket as unknown as Socket;
}

/** The `message` of the last SOCKET_EVENTS.ERROR emitted to a socket. */
function lastErrorMessage(socket: MockSocket): string | undefined {
  const errorCalls = socket.emit.mock.calls.filter(
    (call) => call[0] === SOCKET_EVENTS.ERROR
  );
  return errorCalls[errorCalls.length - 1]?.[1]?.message;
}

/** The payload of the last event of `name` emitted to a socket. */
function lastEmit(socket: MockSocket, name: string) {
  const calls = socket.emit.mock.calls.filter((call) => call[0] === name);
  return calls[calls.length - 1]?.[1];
}

/** A move result as GameService now returns it. */
const acceptedMove = { ok: true, state: { id: GAME_ID } } as never;

describe("GameGateway", () => {
  let gateway: GameGateway;
  let gameService: jest.Mocked<GameService>;
  let jwtService: jest.Mocked<JwtService>;
  let serverEmit: jest.Mock;

  beforeEach(async () => {
    const mockGameService = {
      getPlayerIdForUser: jest.fn(),
      joinGame: jest.fn(),
      leaveGame: jest.fn(),
      startGame: jest.fn(),
      moveCard: jest.fn(),
      flipDrawPile: jest.fn(),
      callBlitz: jest.fn(),
      setPlayerReady: jest.fn(),
      forfeitGame: jest.fn(),
      getGameState: jest.fn(),
    };

    const mockJwtService = {
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        {
          provide: GameService,
          useValue: mockGameService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    gameService = module.get(GameService);
    jwtService = module.get(JwtService);

    // The gateway broadcasts through `this.server`, which Nest would normally
    // inject at bootstrap.
    serverEmit = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: serverEmit }),
    } as never;

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // Item 1: authenticate on connect.
  // ---------------------------------------------------------------------
  describe("handleConnection", () => {
    it("disconnects a socket that sends no token", async () => {
      const client = createMockSocket({});

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.userId).toBeUndefined();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it("disconnects a socket whose token is invalid or expired", async () => {
      const client = createMockSocket({ token: "expired-token" });
      jwtService.verifyAsync.mockRejectedValue(new Error("jwt expired"));

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.userId).toBeUndefined();
    });

    it("disconnects a socket whose token payload has no subject", async () => {
      const client = createMockSocket({ token: "subjectless-token" });
      jwtService.verifyAsync.mockResolvedValue({ username: "nobody" } as never);

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.userId).toBeUndefined();
    });

    it("sets client.data.userId from the token's sub for a valid token", async () => {
      const client = createMockSocket({ token: "valid-token" });
      jwtService.verifyAsync.mockResolvedValue({
        sub: CONNECTED_USER_ID,
        username: "player",
      } as never);

      await gateway.handleConnection(asSocket(client));

      expect(jwtService.verifyAsync).toHaveBeenCalledWith("valid-token");
      expect(client.data.userId).toBe(CONNECTED_USER_ID);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Item 4: room membership is verified against the database.
  // ---------------------------------------------------------------------
  describe("handleMoveCard", () => {
    it("rejects a move from a user who is not a player in that game", async () => {
      const client = createAuthedSocket();
      // The user is authenticated, but not a player in GAME_ID.
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      expect(gameService.moveCard).not.toHaveBeenCalled();
      expect(serverEmit).not.toHaveBeenCalled();
      expect(lastErrorMessage(client)).toBe("You are not a player in this game");
    });

    it("resolves membership against the payload's gameId, not client.data.gameId", async () => {
      const client = createAuthedSocket();
      // The socket is in GAME_ID, but the payload names a different game.
      client.data.gameId = GAME_ID;
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: OTHER_GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      expect(gameService.getPlayerIdForUser).toHaveBeenCalledWith(
        OTHER_GAME_ID,
        CONNECTED_USER_ID
      );
      expect(gameService.moveCard).not.toHaveBeenCalled();
    });

    it("moves the card as the CONNECTION's player, not any id from the payload", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue(acceptedMove);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      // Identity is derived from the socket's authenticated user.
      expect(gameService.getPlayerIdForUser).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_USER_ID
      );
      expect(gameService.moveCard).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_PLAYER_ID,
        CARD_ID,
        FROM_PILE_ID,
        TO_PILE_ID
      );
      expect(serverEmit).toHaveBeenCalledWith(
        SOCKET_EVENTS.CARD_MOVED,
        expect.anything()
      );
    });

    it("rejects a payload that tries to smuggle someone else's playerId", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue(acceptedMove);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        playerId: VICTIM_PLAYER_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      // playerId is no longer part of the contract, so the payload is
      // refused outright rather than silently acting as the victim.
      expect(gameService.moveCard).not.toHaveBeenCalled();
      expect(lastErrorMessage(client)).toContain("playerId");
    });

    it("emits an error and does not broadcast when the socket is unauthenticated", async () => {
      const client = createMockSocket({});

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      expect(gameService.getPlayerIdForUser).not.toHaveBeenCalled();
      expect(gameService.moveCard).not.toHaveBeenCalled();
      expect(lastErrorMessage(client)).toBe("Not authenticated");
    });

    // -------------------------------------------------------------------
    // Task 5 item 3: broadcast the state the move itself returned. Going
    // back to the service for it would race the next player's move.
    // -------------------------------------------------------------------
    it("broadcasts the state the move returned, without re-reading it", async () => {
      const client = createAuthedSocket();
      const movedState = { id: GAME_ID, status: "playing" };
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue({
        ok: true,
        state: movedState,
      } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      expect(gameService.getGameState).not.toHaveBeenCalled();
      expect(serverEmit).toHaveBeenCalledWith(
        SOCKET_EVENTS.CARD_MOVED,
        expect.objectContaining({ gameState: movedState })
      );
    });

    // -------------------------------------------------------------------
    // Task 5 item 4: a rejected move gets MOVE_REJECTED *with state*, to
    // the mover only. A bare ERROR left the client's gameState identity
    // unchanged, so the card it had hidden stayed invisible forever.
    // -------------------------------------------------------------------
    describe("when the service rejects the move", () => {
      const rejectedState = { id: GAME_ID, status: "playing" };

      beforeEach(() => {
        gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
        gameService.moveCard.mockResolvedValue({
          ok: false,
          state: rejectedState,
          reason: "That card no longer fits on that bank pile",
        } as never);
      });

      async function rejectMove(client: MockSocket) {
        await gateway.handleMoveCard(asSocket(client), {
          gameId: GAME_ID,
          cardId: CARD_ID,
          fromPileId: FROM_PILE_ID,
          toPileId: TO_PILE_ID,
        });
      }

      it("emits MOVE_REJECTED with state and a reason", async () => {
        const client = createAuthedSocket();

        await rejectMove(client);

        const payload = lastEmit(client, SOCKET_EVENTS.MOVE_REJECTED);
        expect(payload).toBeDefined();
        expect(payload.gameState).toBe(rejectedState);
        expect(payload.reason).toBe("That card no longer fits on that bank pile");
      });

      it("does NOT emit a bare ERROR", async () => {
        const client = createAuthedSocket();

        await rejectMove(client);

        expect(lastErrorMessage(client)).toBeUndefined();
      });

      it("tells only the mover - nothing changed for the room", async () => {
        const client = createAuthedSocket();

        await rejectMove(client);

        expect(serverEmit).not.toHaveBeenCalled();
        expect(client.roomEmit).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------
  // Item 4: joining the room only after the service accepts the join.
  // ---------------------------------------------------------------------
  describe("handleJoinGame", () => {
    it("does NOT put the socket in the room when joinGame throws", async () => {
      const client = createAuthedSocket();
      gameService.joinGame.mockRejectedValue(new Error("Game is full"));

      await gateway.handleJoinGame(asSocket(client), { gameId: GAME_ID });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.data.gameId).toBeUndefined();
      expect(lastErrorMessage(client)).toBe("Game is full");
    });

    it("joins the room with the connection's user once joinGame succeeds", async () => {
      const client = createAuthedSocket();
      gameService.joinGame.mockResolvedValue({ id: GAME_ID } as never);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleJoinGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.joinGame).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_USER_ID
      );
      expect(client.join).toHaveBeenCalledWith(GAME_ID);
      expect(client.data.gameId).toBe(GAME_ID);
      expect(client.emit).toHaveBeenCalledWith(
        SOCKET_EVENTS.ROOM_JOINED,
        expect.anything()
      );
    });
  });

  // ---------------------------------------------------------------------
  // Item 5: start_game delegates to the service with the connection's user.
  // ---------------------------------------------------------------------
  describe("handleStartGame", () => {
    it("rejects start_game from a user who is not a player in the game", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleStartGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.startGame).not.toHaveBeenCalled();
      expect(serverEmit).not.toHaveBeenCalled();
    });

    it("passes the CONNECTION's user id to startGame so the host check cannot be spoofed", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.startGame.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleStartGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.startGame).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_USER_ID
      );
      expect(serverEmit).toHaveBeenCalledWith(
        SOCKET_EVENTS.GAME_STARTED,
        expect.anything()
      );
    });

    it("surfaces a non-host rejection as an error and does not broadcast", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.startGame.mockRejectedValue(
        new ForbiddenException("Only the host can start the game")
      );

      await gateway.handleStartGame(asSocket(client), { gameId: GAME_ID });

      expect(serverEmit).not.toHaveBeenCalled();
      expect(lastErrorMessage(client)).toBe("Only the host can start the game");
    });
  });

  // ---------------------------------------------------------------------
  // Item 3/4: the remaining gameplay handlers derive identity too.
  // ---------------------------------------------------------------------
  describe("other gameplay handlers", () => {
    it("rejects flip_card from a non-player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleFlipCard(asSocket(client), {
        gameId: GAME_ID,
        pileId: PILE_ID,
      });

      expect(gameService.flipDrawPile).not.toHaveBeenCalled();
    });

    it("flips the draw pile as the connection's player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.flipDrawPile.mockResolvedValue({} as never);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleFlipCard(asSocket(client), {
        gameId: GAME_ID,
        pileId: PILE_ID,
      });

      expect(gameService.flipDrawPile).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_PLAYER_ID
      );
    });

    it("rejects call_blitz from a non-player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleCallBlitz(asSocket(client), { gameId: GAME_ID });

      expect(gameService.callBlitz).not.toHaveBeenCalled();
    });

    it("calls blitz as the connection's player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.callBlitz.mockResolvedValue({
        success: true,
        winnerId: CONNECTED_PLAYER_ID,
        scores: {},
      });
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleCallBlitz(asSocket(client), { gameId: GAME_ID });

      expect(gameService.callBlitz).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_PLAYER_ID
      );
    });

    it("rejects player_ready from a non-player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handlePlayerReady(asSocket(client), {
        gameId: GAME_ID,
        isReady: true,
      });

      expect(gameService.setPlayerReady).not.toHaveBeenCalled();
    });

    it("sets readiness for the connection's player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.setPlayerReady.mockResolvedValue(undefined);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handlePlayerReady(asSocket(client), {
        gameId: GAME_ID,
        isReady: true,
      });

      expect(gameService.setPlayerReady).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_PLAYER_ID,
        true
      );
    });

    it("rejects forfeit_game from a non-player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleForfeitGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.forfeitGame).not.toHaveBeenCalled();
    });

    it("forfeits as the connection's player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.forfeitGame.mockResolvedValue({
        id: GAME_ID,
        status: "playing",
        players: [],
      } as never);

      await gateway.handleForfeitGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.forfeitGame).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_PLAYER_ID
      );
    });

    it("rejects leave_game from a non-player", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleLeaveGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.leaveGame).not.toHaveBeenCalled();
    });

    it("leaves the game as the connection's user", async () => {
      const client = createAuthedSocket();
      client.data.gameId = GAME_ID;
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.leaveGame.mockResolvedValue({ id: GAME_ID } as never);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);

      await gateway.handleLeaveGame(asSocket(client), { gameId: GAME_ID });

      expect(gameService.leaveGame).toHaveBeenCalledWith(
        GAME_ID,
        CONNECTED_USER_ID
      );
      expect(client.leave).toHaveBeenCalledWith(GAME_ID);
      expect(client.data.gameId).toBeUndefined();
    });
  });
});
