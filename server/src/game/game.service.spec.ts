import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { GameService } from "./game.service";
import { GameRepository } from "./game.repository";
import { PrismaService } from "@prisma";
import { UserService } from "@user/user.service";
import { CARD_COLORS, Card, GAME_CONSTANTS } from "@blurtz/shared";

// PlayerDeckSchema holds card ids to real v4 UUIDs, so fixtures must look like
// one or they fail at the DB boundary rather than on the assertion.
const CARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CARD_TEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const bankCardId = (n: number) =>
  `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

function card(id: string, value: number, color = CARD_COLORS.RED, faceUp = true): Card {
  return { id, value, color, faceUp };
}

/**
 * A game row as Prisma would hand it back, with the bits `getGameState` needs
 * to map a player into state.
 */
function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "game-1",
    name: "Test Game",
    alias: "ABC123",
    maxPlayers: 2,
    hostId: "host-user",
    winnerPlayerId: null,
    status: "playing",
    currentRound: 1,
    targetScore: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function playerRow(id: string, deck: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: `user-${id}`,
    isReady: true,
    score: 0,
    roundScore: 0,
    bankPileCount: 0,
    deck,
    user: { id: `user-${id}`, username: id },
    ...overrides,
  };
}

describe("GameService", () => {
  let service: GameService;
  let prismaService: jest.Mocked<PrismaService>;
  let gameRepository: jest.Mocked<GameRepository>;

  beforeEach(async () => {
    const mockPrismaService = {
      game: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      player: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      roundResult: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    // The lock itself is exercised against a real Postgres in
    // game.concurrency.spec.ts - here it just runs the callback, handing it the
    // mock client that stands in for the transaction.
    const mockGameRepository = {
      withGameLock: jest.fn((_gameId: string, fn: (tx: unknown) => unknown) =>
        fn(mockPrismaService)
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: GameRepository,
          useValue: mockGameRepository,
        },
        // The REAL UserService, over the mocked Prisma: stubbing it out would
        // hide the thing most worth testing - that `recordGameResults` orders
        // its writes - so it runs for real and the assertions look at
        // `prismaService.user.update`.
        UserService,
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    prismaService = module.get(PrismaService);
    gameRepository = module.get(GameRepository);

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createGame", () => {
    beforeEach(() => {
      // No existing game holds the generated alias, so generateUniqueAlias
      // settles on its first attempt.
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.game.create as jest.Mock).mockResolvedValue({
        id: "game-1",
        alias: "ABC123",
      });
      // The join is its own path with its own tests; this one is about what
      // gets written at create time.
      jest.spyOn(service, "joinGame").mockResolvedValue(undefined as never);
    });

    function createdData() {
      return (prismaService.game.create as jest.Mock).mock.calls[0][0].data;
    }

    it("writes the target score it was given", async () => {
      await service.createGame("Friday Night", "host-user", 2, false, 25);

      expect(createdData().targetScore).toBe(25);
    });

    it("defaults to 100 when no target score is given", async () => {
      // Must equal Game.targetScore's schema default: a caller that omits it
      // is unchanged by the field existing.
      await service.createGame("Friday Night", "host-user", 2, false);

      expect(createdData().targetScore).toBe(100);
    });

    it("creates the game and seats the host in one atomic write", async () => {
      const joinSpy = jest.spyOn(service, "joinGame");

      await service.createGame("Test", "host-user", 2, false, 100);

      expect(prismaService.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: "host-user",
            players: { create: { userId: "host-user", deck: null, isReady: false, score: 0 } },
          }),
        })
      );
      expect(joinSpy).not.toHaveBeenCalled();
    });
  });

  describe("findGameByAlias", () => {
    it("requests a narrowed user selection, not the full user record", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(null);

      await service.findGameByAlias("ABC123");

      const callArg = (prismaService.game.findUnique as jest.Mock).mock
        .calls[0][0];

      expect(callArg.where).toEqual({ alias: "ABC123" });
      expect(callArg.select.players.select.user).toEqual({
        select: { id: true, username: true },
      });
      expect(callArg.select.players.select.user).not.toBe(true);
    });

    it("does NOT select the players' decks", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(null);

      await service.findGameByAlias("ABC123");

      const callArg = (prismaService.game.findUnique as jest.Mock).mock
        .calls[0][0];

      // The `select` is what makes this airtight: with `include`, every scalar
      // Prisma grows on Player arrives by default.
      expect(callArg.include).toBeUndefined();
      expect(callArg.select.players.select).not.toHaveProperty("deck");
    });
  });

  describe("moveCard", () => {
    // A legal work→bank move is always the TOP card, so nothing at this level
    // can distinguish `splice(i)` from `splice(i, 1)`. That counterfactual lives
    // where it can be asked directly: `cardsMovedBy` in rules/engine.spec.ts.
    it("moves exactly ONE card from a work pile to a bank pile, not the whole stack", async () => {
      // A legal work pile: descending by one, alternating colour type.
      const cardB = card(CARD_B, 3, CARD_COLORS.BLUE); // bottom
      const cardC = card(CARD_C, 2, CARD_COLORS.YELLOW); // middle
      const cardA = card(CARD_A, 1, CARD_COLORS.RED); // top - the one that plays

      const workPile = { id: "work-1", type: "work", cards: [cardB, cardC, cardA] };
      const bankPile = { id: "bank-1", type: "bank", cards: [] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPile],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [bankPile], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState,
          players: [playerRow("player-1", playerDeck)],
        })
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_A,
        "work-1",
        "bank-1"
      );

      expect(result.ok).toBe(true);

      const playerUpdateArg = (prismaService.player.update as jest.Mock).mock
        .calls[0][0];
      const updatedWorkPile = playerUpdateArg.data.deck.workPiles[0];
      // The cards under the one that played are still there, in order.
      expect(updatedWorkPile.cards).toHaveLength(2);
      expect(updatedWorkPile.cards.map((c: Card) => c.id)).toEqual([
        CARD_B,
        CARD_C,
      ]);
      expect(playerUpdateArg.data.bankPileCount).toEqual({ increment: 1 });

      const gameUpdateArg = (prismaService.game.update as jest.Mock).mock
        .calls[0][0];
      const updatedBankPile = gameUpdateArg.data.gameState.bankPiles[0];
      expect(updatedBankPile.cards).toHaveLength(1);
      expect(updatedBankPile.cards[0].id).toBe(CARD_A);
    });

    // Deliberately illegal: the played card is buried under two others, to prove
    // the guard rejects it rather than splicing it out of the middle.
    it("rejects a work-pile card played to a bank pile from under other cards", async () => {
      const cardA = card(CARD_A, 1, CARD_COLORS.RED); // bottom - buried
      const cardB = card(CARD_B, 9, CARD_COLORS.BLUE);
      const cardC = card(CARD_C, 2, CARD_COLORS.YELLOW); // top

      const workPile = { id: "work-1", type: "work", cards: [cardA, cardB, cardC] };
      const bankPile = { id: "bank-1", type: "bank", cards: [] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPile],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: { bankPiles: [bankPile], currentTurn: 0 },
          players: [playerRow("player-1", playerDeck)],
        })
      );

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_A,
        "work-1",
        "bank-1"
      );

      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toBe(
        "Only the top card of a work pile can be played to a bank pile"
      );

      // Nothing written: no free bank point and no corrupt work pile.
      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("moves the card AND everything stacked above it for a work-to-work move", async () => {
      const cardA = card(CARD_A, 1, CARD_COLORS.RED);
      const cardB = card(CARD_B, 9, CARD_COLORS.BLUE);
      const cardC = card(CARD_C, 2, CARD_COLORS.YELLOW);

      const workPileFrom = { id: "work-1", type: "work", cards: [cardA, cardB, cardC] };
      const workPileTo = { id: "work-2", type: "work", cards: [] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPileFrom, workPileTo],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState,
          players: [playerRow("player-1", playerDeck)],
        })
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_A,
        "work-1",
        "work-2"
      );

      expect(result.ok).toBe(true);

      const playerUpdateArg = (prismaService.player.update as jest.Mock).mock
        .calls[0][0];
      const [updatedFrom, updatedTo] = playerUpdateArg.data.deck.workPiles;
      expect(updatedFrom.cards).toHaveLength(0);
      expect(updatedTo.cards.map((c: Card) => c.id)).toEqual([
        CARD_A,
        CARD_B,
        CARD_C,
      ]);
      // A work-to-work move is not a bank move.
      expect(playerUpdateArg.data.bankPileCount).toBeUndefined();
    });

    it("does NOT clear a bank pile once it reaches 10 cards", async () => {
      const bankCards = Array.from({ length: 9 }, (_, i) =>
        card(bankCardId(i + 1), i + 1, CARD_COLORS.RED)
      );
      const bankPile = { id: "bank-1", type: "bank", cards: bankCards };

      const tenthCard = card(CARD_TEN, 10, CARD_COLORS.RED);
      const workPile = { id: "work-1", type: "work", cards: [tenthCard] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPile],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [bankPile], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState,
          players: [playerRow("player-1", playerDeck)],
        })
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_TEN,
        "work-1",
        "bank-1"
      );

      expect(result.ok).toBe(true);

      const gameUpdateArg = (prismaService.game.update as jest.Mock).mock
        .calls[0][0];
      const updatedBankPile = gameUpdateArg.data.gameState.bankPiles[0];
      // Full pile is inert but must NOT be cleared for reuse.
      expect(updatedBankPile.cards).toHaveLength(10);
      expect(updatedBankPile.cards[9].id).toBe(CARD_TEN);
    });

    it("throws BadRequestException when the game is not in progress", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          status: "waiting",
          gameState: { bankPiles: [], currentTurn: 0 },
          players: [],
        })
      );

      await expect(
        service.moveCard("game-1", "player-1", CARD_A, "work-1", "bank-1")
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("does all of its work inside the game lock", async () => {
      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [{ id: "work-1", type: "work", cards: [card(CARD_A, 1)] }],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: {
            bankPiles: [{ id: "bank-1", type: "bank", cards: [] }],
            currentTurn: 0,
          },
          players: [playerRow("player-1", playerDeck)],
        })
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.moveCard("game-1", "player-1", CARD_A, "work-1", "bank-1");

      expect(gameRepository.withGameLock).toHaveBeenCalledWith(
        "game-1",
        expect.any(Function)
      );
    });

    it("returns { ok: true } with the resulting state on an accepted move", async () => {
      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [{ id: "work-1", type: "work", cards: [card(CARD_A, 1)] }],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: {
            bankPiles: [{ id: "bank-1", type: "bank", cards: [] }],
            currentTurn: 0,
          },
          players: [playerRow("player-1", playerDeck)],
        })
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_A,
        "work-1",
        "bank-1"
      );

      expect(result.ok).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.state.id).toBe("game-1");
      // Unredacted internal state: redaction is the gateway's job, later.
      expect(result.state.players[0].deck).toBeDefined();
    });

    it("returns { ok: false } WITH state and a reason on a rejected move", async () => {
      // A 5 cannot go on an empty bank pile - only an ace can.
      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [{ id: "work-1", type: "work", cards: [card(CARD_A, 5)] }],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: {
            bankPiles: [{ id: "bank-1", type: "bank", cards: [] }],
            currentTurn: 0,
          },
          players: [playerRow("player-1", playerDeck)],
        })
      );

      const result = await service.moveCard(
        "game-1",
        "player-1",
        CARD_A,
        "work-1",
        "bank-1"
      );

      expect(result.ok).toBe(false);
      // A rejection is not a bare failure: without state the client has nothing
      // to reconcile against and the card stays invisible.
      expect(result.state).toBeDefined();
      expect(result.state.id).toBe("game-1");
      expect((result as { reason: string }).reason).toBe(
        "That card no longer fits on that bank pile"
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("throws rather than play on when the stored deck is malformed", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: { bankPiles: [], currentTurn: 0 },
          players: [
            // Deliberately malformed: workPiles is missing entirely.
            playerRow("player-1", {
              blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
              drawPile: { id: "draw-1", type: "draw", cards: [] },
            }),
          ],
        })
      );

      await expect(
        service.moveCard("game-1", "player-1", CARD_A, "work-1", "bank-1")
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("throws when a card in the stored deck is not a card", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: { bankPiles: [], currentTurn: 0 },
          players: [
            playerRow("player-1", {
              blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
              workPiles: [
                { id: "work-1", type: "work", cards: [{ id: CARD_A }] },
              ],
              drawPile: { id: "draw-1", type: "draw", cards: [] },
            }),
          ],
        })
      );

      await expect(
        service.moveCard("game-1", "player-1", CARD_A, "work-1", "bank-1")
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe("startGame", () => {
    it("throws BadRequestException if the game has already started", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "playing",
        hostId: "host-user",
        players: [{ id: "p1" }, { id: "p2" }],
      });

      await expect(service.startGame("game-1", "host-user")).rejects.toThrow(
        BadRequestException
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a non-host tries to start the game", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "host-user",
        players: [
          { id: "p1", userId: "host-user", isReady: true },
          { id: "p2", userId: "other-user", isReady: true },
        ],
      });

      await expect(service.startGame("game-1", "other-user")).rejects.toThrow(
        ForbiddenException
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    // `hostId` is a User id and outlives the host's Player row. The socket path
    // checks membership first, but the REST route calls startGame directly.
    it("throws ForbiddenException when the host has left the game", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        // hostId still names the departed user...
        hostId: "departed-host",
        // ...but they have no Player row any more.
        players: [
          { id: "p1", userId: "player-a", isReady: true },
          { id: "p2", userId: "player-b", isReady: true },
        ],
      });

      await expect(
        service.startGame("game-1", "departed-host")
      ).rejects.toThrow(ForbiddenException);

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when the host starts with a player not ready", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "host-user",
        players: [
          { id: "p1", userId: "host-user", isReady: true },
          { id: "p2", userId: "other-user", isReady: false },
        ],
      });

      await expect(service.startGame("game-1", "host-user")).rejects.toThrow(
        "All players must be ready to start the game"
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when the host starts below the minimum player count", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "host-user",
        players: [{ id: "p1", userId: "host-user", isReady: true }],
      });

      await expect(service.startGame("game-1", "host-user")).rejects.toThrow(
        "Not enough players to start the game"
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("starts the game when the host starts with every player ready", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        name: "Test Game",
        alias: "ABC123",
        maxPlayers: 2,
        status: "waiting",
        hostId: "host-user",
        winnerPlayerId: null,
        currentRound: 1,
        targetScore: 100,
        gameState: { bankPiles: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
        players: [
          {
            id: "p1",
            userId: "host-user",
            isReady: true,
            score: 0,
            roundScore: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "host-user", username: "host" },
          },
          {
            id: "p2",
            userId: "other-user",
            isReady: true,
            score: 0,
            roundScore: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "other-user", username: "guest" },
          },
        ],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.startGame("game-1", "host-user");

      expect(result.id).toBe("game-1");
      expect(prismaService.player.update).toHaveBeenCalledTimes(2);
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "playing" },
      });
    });

    // Nothing else clears `isReady` - `callBlitz` does not - so a lobby `true`
    // left standing here survives round 1 and pre-satisfies the round-over gate.
    it("clears everyone's readiness when it deals, so the round-over gate holds", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        name: "Test Game",
        alias: "ABC123",
        maxPlayers: 2,
        status: "waiting",
        hostId: "host-user",
        winnerPlayerId: null,
        currentRound: 1,
        targetScore: 100,
        gameState: { bankPiles: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
        players: [
          {
            id: "p1",
            userId: "host-user",
            isReady: true,
            score: 0,
            roundScore: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "host-user", username: "host" },
          },
          {
            id: "p2",
            userId: "other-user",
            isReady: true,
            score: 0,
            roundScore: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "other-user", username: "guest" },
          },
        ],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.startGame("game-1", "host-user");

      const updates = (prismaService.player.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );
      expect(updates).toHaveLength(2);

      for (const update of updates) {
        expect(update.data.isReady).toBe(false);
        // The SAME write: the readiness and the deck it belongs to cannot land
        // apart.
        expect(update.data.deck).toBeDefined();
        // `score` is the running total - no deal may touch it.
        expect(update.data).not.toHaveProperty("score");
      }
    });
  });

  describe("getPlayerIdForUser", () => {
    it("returns the player id for a user who is in the game", async () => {
      (prismaService.player.findFirst as jest.Mock).mockResolvedValue({
        id: "player-1",
      });

      const result = await service.getPlayerIdForUser("game-1", "user-1");

      expect(result).toBe("player-1");
      expect(prismaService.player.findFirst).toHaveBeenCalledWith({
        where: { gameId: "game-1", userId: "user-1" },
        select: { id: true },
      });
    });

    it("returns null for a user who is not a player in the game", async () => {
      (prismaService.player.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getPlayerIdForUser("game-1", "outsider");

      expect(result).toBeNull();
    });
  });

  describe("flipDrawPile", () => {
    it("throws BadRequestException when the game is not in progress", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        players: [{ id: "player-1", deck: null }],
      });

      await expect(
        service.flipDrawPile("game-1", "player-1")
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });
  });

  describe("joinGame private-game access", () => {
    const GAME_ID = "game-1";
    const USER_ID = "user-outsider";

    // A waiting, non-full game with one player already in it.
    function privateGame(isPrivate: boolean) {
      return {
        id: GAME_ID,
        status: "waiting",
        isPrivate,
        maxPlayers: 4,
        players: [{ id: "player-host", userId: "user-host" }],
      };
    }

    it("rejects joining a private game when only its id is known", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        privateGame(true)
      );

      await expect(service.joinGame(GAME_ID, USER_ID)).rejects.toThrow(
        ForbiddenException
      );
      expect(prismaService.player.create).not.toHaveBeenCalled();
    });

    it("allows joining a private game via the invite-code path", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        privateGame(true)
      );
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        username: "outsider",
      });

      await service.joinGame(GAME_ID, USER_ID, { allowPrivate: true });

      expect(prismaService.player.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: USER_ID, gameId: GAME_ID }),
        })
      );
    });

    it("still allows joining a public game by id", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        privateGame(false)
      );
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        username: "outsider",
      });

      await service.joinGame(GAME_ID, USER_ID);

      expect(prismaService.player.create).toHaveBeenCalled();
    });

    it("lets an existing player rejoin a private game by id", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        ...privateGame(true),
        players: [{ id: "player-1", userId: USER_ID }],
      });

      await expect(
        service.joinGame(GAME_ID, USER_ID)
      ).resolves.toBeDefined();
      expect(prismaService.player.create).not.toHaveBeenCalled();
    });
  });

  describe("leaveGame host reassignment", () => {
    // `hostId` outlives the host's Player row: with nobody inheriting the role,
    // the game is unstartable by anyone left in it.
    it("hands the host role to a remaining player when the host leaves", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "user-host",
        players: [
          { id: "p1", userId: "user-host", user: { id: "user-host" } },
          { id: "p2", userId: "user-second", user: { id: "user-second" } },
        ],
      });
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.leaveGame("game-1", "user-host").catch(() => {
        // readGameState re-reads at the end; we only care about the update above.
      });

      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { hostId: "user-second" },
      });
    });

    it("does not reassign the host when a non-host leaves", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "user-host",
        players: [
          { id: "p1", userId: "user-host", user: { id: "user-host" } },
          { id: "p2", userId: "user-second", user: { id: "user-second" } },
        ],
      });
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.leaveGame("game-1", "user-second").catch(() => {});

      const hostWrites = (prismaService.game.update as jest.Mock).mock.calls
        .filter((c) => c[0]?.data?.hostId !== undefined);
      expect(hostWrites).toHaveLength(0);
    });
  });

  describe("leaveGame by status", () => {
    // round_over is a game in progress. Deleting a player out of it through the
    // lobby path strands it: one player left, joinGame refuses a non-waiting
    // game, and the round advance cannot fire below MIN_PLAYERS.
    it("finishes a two-player round_over game rather than stranding it", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "round_over",
        hostId: "user-stayer",
        players: [
          { id: "p1", userId: "user-quitter", user: { id: "user-quitter" } },
          { id: "p2", userId: "user-stayer", user: { id: "user-stayer" } },
        ],
      });
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      await service.leaveGame("game-1", "user-quitter").catch(() => {});

      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "finished", winnerPlayerId: "p2", roundOverAt: null },
      });
      // It was a real game, so it is credited like one.
      const calls = (prismaService.user.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );
      expect(calls).toContainEqual({
        where: { id: "user-stayer" },
        data: { gamesPlayed: { increment: 1 }, gamesWon: { increment: 1 } },
      });
      expect(calls).toContainEqual({
        where: { id: "user-quitter" },
        data: { gamesPlayed: { increment: 1 } },
      });
    });

    // Deleting the Player row a finished game points at nulls `winnerPlayerId`
    // through ON DELETE SET NULL. It no-ops rather than throwing because leaving
    // a finished game is the NORMAL way out of one.
    it("leaves a finished game alone - no delete, no host write", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          status: "finished",
          hostId: "user-winner",
          winnerPlayerId: "p1",
          gameState: { bankPiles: [] },
          players: [
            playerRow("p1", null, {
              userId: "user-winner",
              user: { id: "user-winner", username: "winner" },
            }),
            playerRow("p2", null, {
              userId: "user-loser",
              user: { id: "user-loser", username: "loser" },
            }),
          ],
        })
      );
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      const state = await service.leaveGame("game-1", "user-winner");

      // The record is untouched: the row stays, the winner still points at it,
      // and the host is not handed to the loser on the way past.
      expect(prismaService.player.delete).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
      expect(prismaService.user.update).not.toHaveBeenCalled();
      // State still comes back, so the gateway can let them out of the room.
      expect(state.winner).toBe("p1");
      expect(state.status).toBe("finished");
    });
  });

  describe("host reassignment on a forfeit that the game survives", () => {
    it("hands the host role on when the host forfeits a three-player game", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          status: "playing",
          hostId: "user-host",
          players: [
            { id: "p1", userId: "user-host" },
            { id: "p2", userId: "user-second" },
            { id: "p3", userId: "user-third" },
          ],
        })
      );
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.forfeitGame("game-1", "p1").catch(() => {});

      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { hostId: "user-second" },
      });
      // Two players are still playing it: nobody has won and nothing is
      // credited.
      const finishes = (prismaService.game.update as jest.Mock).mock.calls
        .filter((c) => c[0]?.data?.status !== undefined);
      expect(finishes).toHaveLength(0);
    });

    it("does not touch the host when a non-host forfeits", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          status: "playing",
          hostId: "user-host",
          players: [
            { id: "p1", userId: "user-host" },
            { id: "p2", userId: "user-second" },
            { id: "p3", userId: "user-third" },
          ],
        })
      );
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      await service.forfeitGame("game-1", "p2").catch(() => {});

      const hostWrites = (prismaService.game.update as jest.Mock).mock.calls
        .filter((c) => c[0]?.data?.hostId !== undefined);
      expect(hostWrites).toHaveLength(0);
    });
  });
  // The candidate query. What it FINDS is settled against a real database in
  // game.concurrency.spec.ts; what is pinned here is the filter, because a
  // wrong one either forfeits live games or never fires at all.
  describe("findTimedOutRoundOverGames", () => {
    it("asks only for round_over games past the deadline", async () => {
      (prismaService.game.findMany as jest.Mock).mockResolvedValue([
        { id: "game-1" },
      ]);
      const before = Date.now();

      expect(await service.findTimedOutRoundOverGames()).toEqual(["game-1"]);

      const { where } = (prismaService.game.findMany as jest.Mock).mock
        .calls[0][0];
      expect(where.status).toBe("round_over");

      // The cutoff is one timeout ago, so a game that entered the interstitial
      // more recently than that cannot match.
      const cutoff = where.roundOverAt.lte.getTime();
      expect(cutoff).toBeGreaterThanOrEqual(
        before - GAME_CONSTANTS.ROUND_OVER_TIMEOUT_MS
      );
      expect(cutoff).toBeLessThanOrEqual(
        Date.now() - GAME_CONSTANTS.ROUND_OVER_TIMEOUT_MS
      );
    });

    it("runs outside the lock - it decides nothing", async () => {
      (prismaService.game.findMany as jest.Mock).mockResolvedValue([]);

      await service.findTimedOutRoundOverGames();

      expect(gameRepository.withGameLock).not.toHaveBeenCalled();
    });
  });

  describe("setPlayerReady", () => {
    function readyGame(status: string) {
      return {
        id: "game-1",
        status,
        players: [playerRow("p1", null, { isReady: false })],
      };
    }

    function mockReady(status: string) {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        readyGame(status)
      );
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
    }

    it("does all of its work inside the game lock", async () => {
      mockReady("waiting");

      await service.setPlayerReady("game-1", "p1", true);

      expect(gameRepository.withGameLock).toHaveBeenCalledWith(
        "game-1",
        expect.any(Function)
      );
    });

    it("lets a player ready up in the lobby", async () => {
      mockReady("waiting");

      await service.setPlayerReady("game-1", "p1", true);

      expect(prismaService.player.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { isReady: true },
      });
    });

    it("lets a player ready up between rounds", async () => {
      mockReady("round_over");

      await service.setPlayerReady("game-1", "p1", true);

      expect(prismaService.player.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { isReady: true },
      });
    });

    // The UI does not draw the control during play, but the server must not rely
    // on a hidden button: a hand-crafted socket message can set `true` mid-round,
    // and nothing clears it before the next interstitial's gate reads it.
    it("refuses a readiness change while the game is playing", async () => {
      mockReady("playing");

      await expect(service.setPlayerReady("game-1", "p1", true)).rejects.toThrow(
        BadRequestException
      );
      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("refuses a readiness change once the game is finished", async () => {
      mockReady("finished");

      await expect(service.setPlayerReady("game-1", "p1", true)).rejects.toThrow(
        BadRequestException
      );
      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("throws when the player is not in the game", async () => {
      mockReady("waiting");

      await expect(
        service.setPlayerReady("game-1", "nobody", true)
      ).rejects.toThrow(NotFoundException);
      expect(prismaService.player.update).not.toHaveBeenCalled();
    });
  });

  describe("callBlitz scoring and the round/game transition", () => {
    const blurtzCardId = (n: number) =>
      `ffffffff-ffff-4fff-8fff-${String(n).padStart(12, "0")}`;

    /** A schema-valid deck whose blurtz pile holds `remaining` cards. */
    function deckWithBlurtz(remaining: number, prefix = "d") {
      return {
        blurtzPile: {
          id: `${prefix}-blurtz`,
          type: "blurtz",
          cards: Array.from({ length: remaining }, (_, i) =>
            card(blurtzCardId(i), (i % 10) + 1)
          ),
        },
        workPiles: [{ id: `${prefix}-work-0`, type: "work", cards: [] }],
        drawPile: { id: `${prefix}-draw`, type: "draw", cards: [] },
      };
    }

    /**
     * A two-player game mid-round. `caller` has an empty blurtz pile (the only
     * player allowed to call it); `other` is still holding `otherBlurtz` cards.
     */
    function blitzGame({
      targetScore = 100,
      currentRound = 1,
      callerBanked = 10,
      callerScore = 0,
      otherBanked = 4,
      otherScore = 0,
      otherBlurtz = 3,
    } = {}) {
      return gameRow({
        status: "playing",
        targetScore,
        currentRound,
        gameState: { bankPiles: [] },
        players: [
          playerRow("p1", deckWithBlurtz(0, "a"), {
            userId: "user-b", // deliberately NOT sorted with the row order
            bankPileCount: callerBanked,
            score: callerScore,
          }),
          playerRow("p2", deckWithBlurtz(otherBlurtz, "b"), {
            userId: "user-a",
            bankPileCount: otherBanked,
            score: otherScore,
          }),
        ],
      });
    }

    function mockBlitz(game: unknown) {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(game);
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.roundResult.create as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue({});
    }

    it("ends the ROUND, not the game, when nobody has reached the target", async () => {
      // caller: 10 banked - 0 stranded = 10. other: 4 - 2*3 = -2.
      // Highest cumulative is 10, well under a target of 100.
      mockBlitz(blitzGame({ targetScore: 100 }));

      const result = await service.callBlitz("game-1", "p1");

      expect(result.status).toBe("round_over");
      // A round_over game has a leader, not a winner.
      expect(result.winnerId).toBeNull();
      // The interstitial is stamped as it starts: it is the deadline the
      // ready-up timeout is measured from, and this is the only place that
      // knows when it began.
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: {
          status: "round_over",
          winnerPlayerId: null,
          roundOverAt: expect.any(Date),
        },
      });
    });

    it("ends the GAME when the leader's cumulative score reaches the target", async () => {
      // caller carries 95 in from previous rounds and scores 10 => 105 >= 100.
      mockBlitz(blitzGame({ targetScore: 100, callerScore: 95 }));

      const result = await service.callBlitz("game-1", "p1");

      expect(result.status).toBe("finished");
      expect(result.winnerId).toBe("p1");
      // No interstitial to wait in, so no deadline to wait on.
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "finished", winnerPlayerId: "p1", roundOverAt: null },
      });
    });

    it("crosses the target on the CUMULATIVE total, not the round's score", async () => {
      // The round itself only scores 10: it is the running total that ends the
      // game.
      mockBlitz(blitzGame({ targetScore: 12, callerScore: 5 }));

      const result = await service.callBlitz("game-1", "p1");

      // 5 + 10 = 15 >= 12
      expect(result.status).toBe("finished");
      expect(result.scores["p1"]).toBe(15);
      expect(result.roundScores["p1"]).toBe(10);
    });

    it("ACCUMULATES score rather than overwriting it, and records roundScore", async () => {
      mockBlitz(blitzGame({ callerScore: 20, otherScore: 7 }));

      await service.callBlitz("game-1", "p1");

      const updates = (prismaService.player.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );

      // p1: 20 carried + 10 this round = 30.
      expect(updates).toContainEqual({
        where: { id: "p1" },
        data: { score: 30, roundScore: 10 },
      });
      // p2: 7 carried + (4 - 2*3) = 5. A negative round can pull a total DOWN,
      // and must not be clamped.
      expect(updates).toContainEqual({
        where: { id: "p2" },
        data: { score: 5, roundScore: -2 },
      });
    });

    it("writes a RoundResult per player with the scoring inputs", async () => {
      mockBlitz(blitzGame({ currentRound: 3, callerScore: 20, otherScore: 7 }));

      await service.callBlitz("game-1", "p1");

      const rows = (prismaService.roundResult.create as jest.Mock).mock.calls.map(
        (c) => c[0].data
      );

      expect(rows).toHaveLength(2);
      expect(rows).toContainEqual({
        gameId: "game-1",
        playerId: "p1",
        round: 3,
        bankPileCount: 10,
        blurtzRemaining: 0,
        roundScore: 10,
        cumulativeScore: 30,
        calledBlurtz: true,
      });
      expect(rows).toContainEqual({
        gameId: "game-1",
        playerId: "p2",
        round: 3,
        bankPileCount: 4,
        blurtzRemaining: 3,
        roundScore: -2,
        cumulativeScore: 5,
        calledBlurtz: false,
      });
    });

    it("refuses a Blitz from a player whose blurtz pile is not empty", async () => {
      mockBlitz(blitzGame());

      await expect(service.callBlitz("game-1", "p2")).rejects.toThrow(
        "Cannot call Blitz - your Blitz pile is not empty"
      );

      expect(prismaService.roundResult.create).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("refuses a Blitz on a game that is no longer playing", async () => {
      // A `round_over` status is exactly what the loser of a two-caller race
      // reads once it gets into the lock: the winner already committed.
      mockBlitz({ ...blitzGame({ targetScore: 100 }), status: "round_over" });

      await expect(service.callBlitz("game-1", "p1")).rejects.toThrow(
        "Game is not in progress"
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.roundResult.create).not.toHaveBeenCalled();
    });

    it("credits every player's stats exactly once when the game finishes", async () => {
      mockBlitz(blitzGame({ targetScore: 12, callerScore: 5 }));

      await service.callBlitz("game-1", "p1");

      const calls = (prismaService.user.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );

      expect(calls).toHaveLength(2);
      expect(calls).toContainEqual({
        where: { id: "user-b" },
        data: { gamesPlayed: { increment: 1 }, gamesWon: { increment: 1 } },
      });
      // The loser: `gamesWon` is absent, not 0.
      expect(calls).toContainEqual({
        where: { id: "user-a" },
        data: { gamesPlayed: { increment: 1 } },
      });
    });

    it("orders the stats writes by userId ASC to avoid cross-game deadlocks", async () => {
      // Fixture: the player ROWS are deliberately ordered p1 (user-b) then p2
      // (user-a), so dropping the sort makes the writes come out in that order
      // and this fails. See UserService.recordGameResults for the deadlock.
      mockBlitz(blitzGame({ targetScore: 12, callerScore: 5 }));

      await service.callBlitz("game-1", "p1");

      const order = (prismaService.user.update as jest.Mock).mock.calls.map(
        (c) => c[0].where.id
      );
      expect(order).toEqual(["user-a", "user-b"]);
    });

    it("does NOT credit stats when the round ends but the game does not", async () => {
      mockBlitz(blitzGame({ targetScore: 100 }));

      await service.callBlitz("game-1", "p1");

      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  // These cover the deal itself; the two-simultaneous-final-ready-ups race that
  // proves it deals exactly ONCE is in game.concurrency.spec.ts, against a real
  // database.
  describe("the round advancing on the last ready-up", () => {
    // A round_over game with p1 already ready and p2 not: p2's ready-up is the
    // one that completes the table.
    function roundOverGame(overrides: Record<string, unknown> = {}) {
      return {
        id: "game-1",
        status: "round_over",
        currentRound: 2,
        players: [
          playerRow("p1", null, {
            userId: "host-user",
            isReady: true,
            score: 30,
            roundScore: 10,
            bankPileCount: 10,
          }),
          playerRow("p2", null, {
            userId: "other-user",
            isReady: false,
            score: 12,
            roundScore: -2,
            bankPileCount: 4,
          }),
        ],
        ...overrides,
      };
    }

    function mockAdvance(game: unknown) {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(game);
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
    }

    // The deal writes each player's deck; the plain readiness write does not.
    function deckUpdates() {
      return (prismaService.player.update as jest.Mock).mock.calls
        .map((c) => c[0])
        .filter((u) => u.data.deck);
    }

    it("increments currentRound and re-deals a fresh 40-card deck to every player", async () => {
      mockAdvance(roundOverGame());

      await service.setPlayerReady("game-1", "p2", true);

      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: expect.objectContaining({
          status: "playing",
          currentRound: { increment: 1 },
        }),
      });

      const updates = deckUpdates();
      expect(updates).toHaveLength(2);

      for (const update of updates) {
        const deck = update.data.deck;
        const total =
          deck.blurtzPile.cards.length +
          deck.drawPile.cards.length +
          deck.workPiles.reduce(
            (sum: number, p: { cards: unknown[] }) => sum + p.cards.length,
            0
          );
        // A whole deck each, dealt fresh - not last round's cards rearranged.
        expect(total).toBe(40);
        expect(deck.blurtzPile.cards).toHaveLength(10);
      }
    });

    it("resets the per-round counters and readiness but NOT the cumulative score", async () => {
      mockAdvance(roundOverGame());

      await service.setPlayerReady("game-1", "p2", true);

      for (const update of deckUpdates()) {
        expect(update.data.bankPileCount).toBe(0);
        expect(update.data.roundScore).toBe(0);
        expect(update.data.isReady).toBe(false);
        // `score` is the running total the game is played to: a round advance
        // that reset it would make the target unreachable.
        expect(update.data).not.toHaveProperty("score");
      }
    });

    it("resets the shared bank piles", async () => {
      mockAdvance(roundOverGame());

      await service.setPlayerReady("game-1", "p2", true);

      const gameUpdate = (prismaService.game.update as jest.Mock).mock.calls[0][0];
      const bankPiles = gameUpdate.data.gameState.bankPiles;
      // Fresh, empty foundations - last round's runs are scored and gone.
      expect(bankPiles.length).toBeGreaterThan(0);
      expect(bankPiles.every((p: { cards: unknown[] }) => p.cards.length === 0)).toBe(
        true
      );
    });

    it("does NOT deal when the ready-up is not the last one", async () => {
      // Neither player is ready yet; readying ONE of them is not the last.
      mockAdvance(
        roundOverGame({
          players: [
            playerRow("p1", null, { userId: "host-user", isReady: false }),
            playerRow("p2", null, { userId: "other-user", isReady: false }),
          ],
        })
      );

      await service.setPlayerReady("game-1", "p1", true);

      // The readiness write happened; the deal did not.
      expect(prismaService.player.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { isReady: true },
      });
      expect(deckUpdates()).toHaveLength(0);
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("does NOT deal when un-readying is the write, even if that leaves everyone else ready", async () => {
      // p1 ready, p2 ready - and p2 UN-readies. The table is no longer complete,
      // so nothing should deal.
      mockAdvance(
        roundOverGame({
          players: [
            playerRow("p1", null, { userId: "host-user", isReady: true }),
            playerRow("p2", null, { userId: "other-user", isReady: true }),
          ],
        })
      );

      await service.setPlayerReady("game-1", "p2", false);

      expect(deckUpdates()).toHaveLength(0);
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    // The lobby's first deal stays host-gated in `startGame`. A fully-ready
    // `waiting` table must NOT auto-start off a ready-up.
    it("does NOT auto-start the lobby even when the last player readies up", async () => {
      mockAdvance(
        gameRow({
          status: "waiting",
          players: [
            playerRow("p1", null, { userId: "host-user", isReady: true }),
            playerRow("p2", null, { userId: "other-user", isReady: false }),
          ],
        })
      );

      await service.setPlayerReady("game-1", "p2", true);

      expect(deckUpdates()).toHaveLength(0);
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("does all of its work inside the game lock", async () => {
      mockAdvance(roundOverGame());

      await service.setPlayerReady("game-1", "p2", true);

      expect(gameRepository.withGameLock).toHaveBeenCalledWith(
        "game-1",
        expect.any(Function)
      );
    });
  });

  describe("lobby queries - getAvailableGames and getActiveGames", () => {
    it("counts lobby players without selecting player rows", async () => {
      (prismaService.game.findMany as jest.Mock).mockResolvedValue([
        {
          id: "g1",
          name: "G",
          alias: "AAA111",
          maxPlayers: 4,
          status: "waiting",
          createdAt: new Date(),
          _count: { players: 2 },
        },
      ]);
      (prismaService.user.findMany as jest.Mock).mockResolvedValue([]);

      const listings = await service.getAvailableGames();

      const arg = (prismaService.game.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.select._count).toEqual({ select: { players: true } });
      expect(arg.include).toBeUndefined();
      expect(listings[0]).toMatchObject({ id: "g1", currentPlayers: 2 });
    });

    it("does not offer a player a table they are already sitting at", async () => {
    (prismaService.game.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.user.findMany as jest.Mock).mockResolvedValue([]);

    await service.getAvailableGames("u-me");

    expect((prismaService.game.findMany as jest.Mock).mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        players: { none: { userId: "u-me" } },
      })
    );
  });

  it("tells a browsing player what they would be joining", async () => {
      (prismaService.game.findMany as jest.Mock).mockResolvedValue([
        {
          id: "g1",
          name: "Midnight rush",
          alias: "happy-blue-lemur",
          maxPlayers: 4,
          status: "waiting",
          targetScore: 25,
          currentRound: 1,
          hostId: "u-corvid",
          createdAt: new Date("2026-08-31T10:00:00Z"),
          _count: { players: 2 },
        },
      ]);
      (prismaService.user.findMany as jest.Mock).mockResolvedValue([
        { id: "u-corvid", username: "corvid" },
      ]);

      const [listing] = await service.getAvailableGames();

      expect(listing.targetScore).toBe(25);
      expect(listing.currentRound).toBe(1);
      expect(listing.hostUsername).toBe("corvid");
    });

    it("says where the player stands in a game they are already in", async () => {
      (prismaService.player.findMany as jest.Mock).mockResolvedValue([
        { gameId: "g1" },
      ]);
      (prismaService.game.findMany as jest.Mock).mockResolvedValue([
        {
          id: "g1",
          name: "Thursday regulars",
          alias: "happy-blue-lemur",
          maxPlayers: 4,
          status: "playing",
          targetScore: 100,
          currentRound: 3,
          hostId: "u-me",
          createdAt: new Date("2026-08-31T10:00:00Z"),
          _count: { players: 4 },
          players: [
            { userId: "u-me", score: 62 },
            { userId: "u-other", score: 71 },
          ],
        },
      ]);
      (prismaService.user.findMany as jest.Mock).mockResolvedValue([
        { id: "u-me", username: "designpass" },
      ]);

      const [listing] = await service.getActiveGames("u-me");

      expect(listing.yourScore).toBe(62);
      expect(listing.leaderScore).toBe(71);
    });
  });

  describe("game stats on a forfeit", () => {
    it("credits the winner and the forfeiter when a forfeit ends the game", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          status: "playing",
          players: [
            { id: "p1", userId: "user-winner" },
            { id: "p2", userId: "user-quitter" },
          ],
        })
      );
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      await service.forfeitGame("game-1", "p2").catch(() => {});

      const calls = (prismaService.user.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );
      expect(calls).toHaveLength(2);
      expect(calls).toContainEqual({
        where: { id: "user-winner" },
        data: { gamesPlayed: { increment: 1 }, gamesWon: { increment: 1 } },
      });
      expect(calls).toContainEqual({
        where: { id: "user-quitter" },
        data: { gamesPlayed: { increment: 1 } },
      });
    });

    // A lobby nobody turned up to is not a game anybody played. Crediting it
    // would let a user farm gamesPlayed by creating and leaving games.
    it("does NOT credit stats when the last player leaves a WAITING game", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        hostId: "user-lonely",
        players: [
          { id: "p1", userId: "user-lonely", user: { id: "user-lonely" } },
        ],
      });
      (prismaService.player.delete as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      await service.leaveGame("game-1", "user-lonely").catch(() => {});

      // The game IS marked finished - it is the only terminal status there is.
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "finished" },
      });
      // But nobody played it.
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
