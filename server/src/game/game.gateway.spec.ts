import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Socket } from "socket.io";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { SOCKET_EVENTS, SOCKET_ERROR_CODES } from "@blurtz/shared";

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
const OTHER_USER_ID = "user-other";

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

/** The payload of the last SOCKET_EVENTS.ERROR emitted to a socket. */
function lastError(socket: MockSocket): { code?: string; message?: string } | undefined {
  const errorCalls = socket.emit.mock.calls.filter(
    (call) => call[0] === SOCKET_EVENTS.ERROR
  );
  return errorCalls[errorCalls.length - 1]?.[1];
}

function lastErrorMessage(socket: MockSocket): string | undefined {
  return lastError(socket)?.message;
}

/** The payload of the last event of `name` emitted to a socket. */
function lastEmit(socket: MockSocket, name: string) {
  const calls = socket.emit.mock.calls.filter((call) => call[0] === name);
  return calls[calls.length - 1]?.[1];
}

/** A move result as GameService returns it. */
const acceptedMove = { ok: true, state: { id: GAME_ID } } as never;

/**
 * Sockets in a room, as `fetchSockets()` reports them: `data.userId` is the only
 * field presence reads. One id per socket, so repeating one is one user with two
 * tabs open.
 */
function remoteSockets(...userIds: string[]) {
  return userIds.map((userId, index) => ({
    id: `remote-${index}`,
    data: { userId },
  }));
}

describe("GameGateway", () => {
  let gateway: GameGateway;
  let gameService: jest.Mocked<GameService>;
  let jwtService: jest.Mocked<JwtService>;
  let serverEmit: jest.Mock;
  let fetchSockets: jest.Mock;

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
    // inject at bootstrap. `in(...).fetchSockets()` is the room membership
    // presence is derived from; the Redis adapter makes it span every instance.
    serverEmit = jest.fn();
    fetchSockets = jest.fn().mockResolvedValue([]);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: serverEmit }),
      in: jest.fn().mockReturnValue({ fetchSockets }),
    } as never;

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

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

  // Presence is who holds a socket in the room, derived on demand and broadcast
  // as a whole set. A drop used to be a client-side no-op - PLAYER_LEFT with no
  // state, which the client ignores - so nobody could tell a dropped opponent
  // from one who had stopped playing.
  describe("presence", () => {
    /** The last PRESENCE_UPDATED broadcast to a room. */
    function lastPresence() {
      const calls = serverEmit.mock.calls.filter(
        (call) => call[0] === SOCKET_EVENTS.PRESENCE_UPDATED
      );
      return calls[calls.length - 1]?.[1];
    }

    function droppedSocket(): MockSocket {
      const client = createAuthedSocket();
      client.data.gameId = GAME_ID;
      return client;
    }

    it("tells the room who is still connected when a socket drops", async () => {
      const client = droppedSocket();
      // Socket.IO empties a socket's rooms before it fires `disconnect`, so the
      // dropped socket is already gone from what the room reports.
      fetchSockets.mockResolvedValue(remoteSockets(OTHER_USER_ID));

      await gateway.handleDisconnect(asSocket(client));

      expect(gateway.server.in).toHaveBeenCalledWith(GAME_ID);
      expect(lastPresence()).toMatchObject({
        gameId: GAME_ID,
        connectedUserIds: [OTHER_USER_ID],
      });
    });

    it("does not tell the room that a dropped player LEFT the game", async () => {
      const client = droppedSocket();
      fetchSockets.mockResolvedValue(remoteSockets(OTHER_USER_ID));

      await gateway.handleDisconnect(asSocket(client));

      // The Player row survives a drop and the same user rejoins and plays on.
      // PLAYER_LEFT is a genuine departure and would end their game everywhere.
      const left = serverEmit.mock.calls.filter(
        (call) => call[0] === SOCKET_EVENTS.PLAYER_LEFT
      );
      expect(left).toEqual([]);
    });

    it("reports an empty room when the last socket drops", async () => {
      const client = droppedSocket();
      fetchSockets.mockResolvedValue([]);

      await gateway.handleDisconnect(asSocket(client));

      expect(lastPresence()).toMatchObject({ connectedUserIds: [] });
    });

    it("says nothing when a socket that was in no game drops", async () => {
      const client = createAuthedSocket();

      await gateway.handleDisconnect(asSocket(client));

      expect(serverEmit).not.toHaveBeenCalled();
    });

    it("sends the current set to a joiner, not only later changes", async () => {
      const client = createAuthedSocket();
      gameService.joinGame.mockResolvedValue({ id: GAME_ID } as never);
      gameService.getGameState.mockResolvedValue({ id: GAME_ID } as never);
      fetchSockets.mockResolvedValue(
        remoteSockets(CONNECTED_USER_ID, OTHER_USER_ID)
      );

      await gateway.handleJoinGame(asSocket(client), { gameId: GAME_ID });

      // To the room - which the joiner is now in - rather than `client.to(...)`,
      // which is everyone EXCEPT them.
      expect(lastPresence()).toMatchObject({
        connectedUserIds: [CONNECTED_USER_ID, OTHER_USER_ID],
      });
    });

    it("counts a user holding two sockets once", async () => {
      const client = droppedSocket();
      fetchSockets.mockResolvedValue(
        remoteSockets(OTHER_USER_ID, OTHER_USER_ID, CONNECTED_USER_ID)
      );

      await gateway.handleDisconnect(asSocket(client));

      expect(lastPresence().connectedUserIds).toEqual([
        OTHER_USER_ID,
        CONNECTED_USER_ID,
      ]);
    });

    it("names users and carries no game state", async () => {
      const client = droppedSocket();
      fetchSockets.mockResolvedValue(remoteSockets(OTHER_USER_ID));

      await gateway.handleDisconnect(asSocket(client));

      // Presence is connection state. Smuggling a board into it would put an
      // unredacted-by-default payload on a path that never goes near the
      // redactor.
      expect(lastPresence()).not.toHaveProperty("gameState");
      expect(gameService.getGameState).not.toHaveBeenCalled();
    });
  });

  // Every ERROR carries a `code`. It is the only thing the client is allowed to
  // branch on, so a handler that emitted a message alone would silently hand the
  // client back nothing to classify - and its default is "not fatal".
  describe("the error contract", () => {
    const move = {
      gameId: GAME_ID,
      cardId: CARD_ID,
      fromPileId: FROM_PILE_ID,
      toPileId: TO_PILE_ID,
    };

    it("emits NOT_A_PLAYER with its message when the membership gate refuses", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await gateway.handleMoveCard(asSocket(client), move);

      expect(lastError(client)).toMatchObject({
        code: SOCKET_ERROR_CODES.NOT_A_PLAYER,
        message: "You are not a player in this game",
      });
    });

    it("carries a code the service threw through to the wire", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockRejectedValue(
        new NotFoundException({
          code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
          message: "Game not found",
        })
      );

      await gateway.handleMoveCard(asSocket(client), move);

      expect(lastError(client)).toMatchObject({
        code: SOCKET_ERROR_CODES.GAME_NOT_FOUND,
        message: "Game not found",
      });
    });

    // The distinction the client depends on: both say "not found", only one is
    // an eviction. Collapsing them here is the original bug, one layer down.
    it("does not dress a lost race up as NOT_A_PLAYER", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockRejectedValue(
        new NotFoundException({
          code: SOCKET_ERROR_CODES.PLAYER_NOT_FOUND,
          message: "Player not found in this game",
        })
      );

      await gateway.handleMoveCard(asSocket(client), move);

      expect(lastError(client)?.code).toBe(SOCKET_ERROR_CODES.PLAYER_NOT_FOUND);
    });

    it("falls back to UNKNOWN for an exception carrying no code", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockRejectedValue(
        new BadRequestException("Game is not in progress")
      );

      await gateway.handleMoveCard(asSocket(client), move);

      expect(lastError(client)).toMatchObject({
        code: SOCKET_ERROR_CODES.UNKNOWN,
        message: "Game is not in progress",
      });
    });

    it("falls back to UNKNOWN for a plain thrown Error", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockRejectedValue(new Error("connection pool timeout"));

      await gateway.handleMoveCard(asSocket(client), move);

      expect(lastError(client)?.code).toBe(SOCKET_ERROR_CODES.UNKNOWN);
    });

    it("emits INVALID_PAYLOAD when the payload fails validation", async () => {
      const client = createAuthedSocket();

      await gateway.handleMoveCard(asSocket(client), { gameId: "not-a-uuid" });

      expect(gameService.moveCard).not.toHaveBeenCalled();
      expect(lastError(client)?.code).toBe(SOCKET_ERROR_CODES.INVALID_PAYLOAD);
    });
  });

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

      // playerId is not part of the contract, so the payload is refused outright
      // rather than silently acting as the victim.
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

    // The state the move itself returned: going back to the service for it
    // would race the next player's move.
    it("broadcasts the state the move returned, without re-reading it", async () => {
      const client = createAuthedSocket();
      const movedState = { id: GAME_ID, status: "playing", players: [], bankPiles: [] };
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
      // Redaction rebuilds the object, so this is `toEqual` on the content
      // rather than identity - the point of the test is the SOURCE of the
      // state, and re-reading it is proven absent above.
      expect(serverEmit).toHaveBeenCalledWith(
        SOCKET_EVENTS.CARD_MOVED,
        expect.objectContaining({ gameState: expect.objectContaining({ id: GAME_ID, status: "playing" }) })
      );
    });

    // A rejected move gets MOVE_REJECTED *with state*, to the mover only: a bare
    // ERROR leaves the client's gameState identity unchanged, so the card it had
    // hidden stays invisible forever.
    describe("when the service rejects the move", () => {
      const rejectedState = {
        id: GAME_ID,
        status: "playing",
        players: [],
        bankPiles: [],
      };

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
        expect(payload.gameState).toEqual(rejectedState);
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

  // GameService returns UNREDACTED state by contract - these prove the gateway
  // never emits it. The redactor's own behaviour is pinned in
  // rules/redact.spec.ts; what is tested here is that it is WIRED IN on the
  // paths that broadcast.
  describe("redaction of emitted state", () => {
    const HIDDEN_CARD_ID = "77777777-7777-4777-8777-777777777777";
    const VISIBLE_CARD_ID = "88888888-8888-4888-8888-888888888888";
    const DRAW_PILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    /** Internal state as the service really returns it: values and all. */
    function internalState() {
      return {
        id: GAME_ID,
        status: "playing",
        players: [
          {
            id: CONNECTED_PLAYER_ID,
            deck: {
              blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
              workPiles: [],
              drawPile: {
                id: DRAW_PILE_ID,
                type: "draw",
                cards: [
                  {
                    id: HIDDEN_CARD_ID,
                    value: 7,
                    number: 7,
                    color: { name: "Red", code: "#DC2626", type: "a" },
                    faceUp: false,
                  },
                  {
                    id: VISIBLE_CARD_ID,
                    value: 3,
                    number: 3,
                    color: { name: "Blue", code: "#2563EB", type: "a" },
                    faceUp: true,
                  },
                ],
              },
            },
          },
        ],
        bankPiles: [],
      };
    }

    /** The draw pile as it was actually emitted. */
    function emittedDrawPile(payload: { gameState: { players: Array<{ deck: { drawPile: { cards: Array<Record<string, unknown>> } } }> } }) {
      return payload.gameState.players[0].deck.drawPile.cards;
    }

    it("redacts CARD_MOVED - the broadcast every player receives", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue({
        ok: true,
        state: internalState(),
      } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      const [, payload] = serverEmit.mock.calls.find(
        (call) => call[0] === SOCKET_EVENTS.CARD_MOVED
      );
      const [hidden, visible] = emittedDrawPile(payload);

      expect(hidden).toEqual({ id: `hidden:${DRAW_PILE_ID}:0`, faceUp: false });
      expect(visible).toMatchObject({ id: VISIBLE_CARD_ID, value: 3 });
    });

    it("redacts GAME_STARTED - the deal itself", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.startGame.mockResolvedValue(internalState() as never);

      await gateway.handleStartGame(asSocket(client), { gameId: GAME_ID });

      const [, payload] = serverEmit.mock.calls.find(
        (call) => call[0] === SOCKET_EVENTS.GAME_STARTED
      );

      expect(emittedDrawPile(payload)[0]).toEqual({
        id: `hidden:${DRAW_PILE_ID}:0`,
        faceUp: false,
      });
    });

    it("emits the redacted state, NOT the object the service returned", async () => {
      const client = createAuthedSocket();
      const state = internalState();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue({ ok: true, state } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      const [, payload] = serverEmit.mock.calls.find(
        (call) => call[0] === SOCKET_EVENTS.CARD_MOVED
      );

      expect(payload.gameState).not.toBe(state);
      // And the service's own copy is untouched - redaction does not reach
      // back into the state the game is still being played with.
      expect(state.players[0].deck.drawPile.cards[0].value).toBe(7);
    });

    it("leaks no hidden card value into the CARD_MOVED frame", async () => {
      // Serialise-and-grep: the frame is what an attacker reads.
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue({
        ok: true,
        state: internalState(),
      } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      const [, payload] = serverEmit.mock.calls.find(
        (call) => call[0] === SOCKET_EVENTS.CARD_MOVED
      );
      const frame = JSON.stringify(payload);

      expect(frame).not.toContain(HIDDEN_CARD_ID);
      expect(frame).toContain(VISIBLE_CARD_ID);
    });

    it("redacts MOVE_REJECTED - one socket is still a leak", async () => {
      const client = createAuthedSocket();
      gameService.getPlayerIdForUser.mockResolvedValue(CONNECTED_PLAYER_ID);
      gameService.moveCard.mockResolvedValue({
        ok: false,
        state: internalState(),
        reason: "That card no longer fits on that bank pile",
      } as never);

      await gateway.handleMoveCard(asSocket(client), {
        gameId: GAME_ID,
        cardId: CARD_ID,
        fromPileId: FROM_PILE_ID,
        toPileId: TO_PILE_ID,
      });

      const payload = lastEmit(client, SOCKET_EVENTS.MOVE_REJECTED);

      expect(emittedDrawPile(payload)[0]).toEqual({
        id: `hidden:${DRAW_PILE_ID}:0`,
        faceUp: false,
      });
    });

    it("redacts state read back through getGameState (ROOM_JOINED)", async () => {
      const client = createAuthedSocket();
      gameService.joinGame.mockResolvedValue({ id: GAME_ID } as never);
      gameService.getGameState.mockResolvedValue(internalState() as never);

      await gateway.handleJoinGame(asSocket(client), { gameId: GAME_ID });

      const payload = lastEmit(client, SOCKET_EVENTS.ROOM_JOINED);

      expect(emittedDrawPile(payload)[0]).toEqual({
        id: `hidden:${DRAW_PILE_ID}:0`,
        faceUp: false,
      });
    });
  });

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
        roundScores: {},
        status: "finished",
        round: 1,
        // The handler redacts and emits the state the call returns, rather
        // than re-reading it - so the mock has to supply one.
        state: { id: GAME_ID, players: [], bankPiles: [] } as never,
      });

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
