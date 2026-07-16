import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { GameService } from "./game.service";
import { GameRepository } from "./game.repository";
import { PrismaService } from "@prisma";
import { UserService } from "@user/user.service";
import { CARD_COLORS, Card } from "@blurtz/shared";

// Decks are validated against PlayerDeckSchema on the way out of the
// database, and it holds card ids to real v4 UUIDs - so fixtures must look
// like one, the same way the gateway spec's ids do.
const CARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CARD_TEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const bankCardId = (n: number) =>
  `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

// Small helper to keep card fixtures short and consistent.
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
        update: jest.fn(),
      },
      player: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      roundResult: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    // The lock itself is exercised against a real Postgres in
    // game.concurrency.spec.ts - here it just has to run the callback, handing
    // it the mock client that stands in for the transaction.
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
        // The REAL UserService, over the mocked Prisma. Stubbing it out would
        // hide the thing most worth testing about it - that
        // `recordGameResults` orders its writes - so it runs for real and the
        // assertions look at `prismaService.user.update`.
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

  // ---------------------------------------------------------------------
  // Item 1: findGameByAlias must not leak password hashes via `user: true`.
  // Task 8: nor decks - this game is the `joinByCode` response body.
  // ---------------------------------------------------------------------
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
      // Explicitly guard against a regression back to `user: true`.
      expect(callArg.select.players.select.user).not.toBe(true);
    });

    it("does NOT select the players' decks", async () => {
      // `deck` is a scalar, so the `include: { players: ... }` this used to
      // use selected it - and the caller returns this game straight to the
      // client. A player rejoining a game in progress by its invite code got
      // every opponent's face-down cards, no socket required.
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(null);

      await service.findGameByAlias("ABC123");

      const callArg = (prismaService.game.findUnique as jest.Mock).mock
        .calls[0][0];

      // A `select` is what makes this airtight: with `include`, every scalar
      // Prisma grows on Player arrives by default. Here nothing arrives
      // unless it is named, and `deck` is not.
      expect(callArg.include).toBeUndefined();
      expect(callArg.select.players.select).not.toHaveProperty("deck");
    });
  });

  // ---------------------------------------------------------------------
  // Item 3 & 4: moveCard / executeMove stack-move + bank-pile behaviour.
  // ---------------------------------------------------------------------
  describe("moveCard", () => {
    // This test used to play the card at the BOTTOM of a work pile straight to
    // a bank pile - the only fixture that could tell `splice(i)` from
    // `splice(i, 1)` at this level. That move is now correctly rejected (a
    // foundation only takes the accessible card), so the fixture has been
    // re-pointed onto a legal one: the TOP card of a real, legal work pile,
    // with cards underneath that must survive.
    //
    // A legal work→bank move is always the top card, so it can no longer
    // distinguish the two splice branches here - by construction, nothing at
    // this level can. That distinction now lives where it can actually be
    // asked as a counterfactual: `cardsMovedBy` in rules/engine.spec.ts. This
    // test keeps the other half of the regression: one card leaves, the pile
    // beneath it is not swept along, and the bank counter moves by exactly one.
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

    // -------------------------------------------------------------------
    // Task 7 item 2: a buried work-pile card may not be played to a bank
    // pile. This is the exact fixture that used to be accepted: the move
    // spliced a card out of the MIDDLE of the pile, left the cards above it
    // behind as a stack that was never legal, and credited a bank point for
    // it - repeatable for every face-up card in the pile.
    // -------------------------------------------------------------------
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

      // The crux: nothing was written, so no free bank point and no corrupt
      // work pile.
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

    // -------------------------------------------------------------------
    // Item 6: status guards.
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Task 5 item 1: every mutation runs inside the game's row lock.
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Task 5 item 3: MoveResult carries state on BOTH outcomes.
    // -------------------------------------------------------------------
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
      // The crux: a rejection is not a bare failure. Without state the client
      // has nothing to reconcile against and the card stays invisible.
      expect(result.state).toBeDefined();
      expect(result.state.id).toBe("game-1");
      expect((result as { reason: string }).reason).toBe(
        "That card no longer fits on that bank pile"
      );

      // Nothing was written.
      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Task 5 item 5: the deck JSON is validated at the DB boundary.
    // -------------------------------------------------------------------
    it("throws rather than play on when the stored deck is malformed", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(
        gameRow({
          gameState: { bankPiles: [], currentTurn: 0 },
          players: [
            // workPiles is missing entirely - a shape no move can be
            // meaningfully validated against.
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

  // ---------------------------------------------------------------------
  // Item 6: startGame status guard.
  // ---------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Task 4 item 5: only the host may start, and only when everyone is
    // ready. `hostId` is a User id, not a Player id.
    // -------------------------------------------------------------------
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

    // A departed host keeps `hostId` on the game row. The socket path checks
    // membership first, but the REST route calls startGame directly - so
    // without a membership check here, someone who left can still start it.
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
      // Each player is dealt a deck, and the game is flipped to `playing`.
      expect(prismaService.player.update).toHaveBeenCalledTimes(2);
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "playing" },
      });
    });
  });

  // ---------------------------------------------------------------------
  // Task 4 item 3: the gateway resolves identity through this, instead of
  // trusting a playerId sent over the socket.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Item 6: flipDrawPile status guard.
  // ---------------------------------------------------------------------
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
      // The crux: no Player row may be created for the outsider.
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
    // `hostId` outlives the host's Player row. If the host leaves a waiting
    // game and nobody inherits the role, the game is unstartable by anyone
    // left in it - and the departed host could still start it over REST.
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
  // ---------------------------------------------------------------------
  // Task 10: multi-round.
  //
  // The scaffolding for rounds existed but was vestigial - `currentRound` was
  // hard-coded to 0 in `readGameState`, `bankPileCount` accumulated forever,
  // and `callBlitz` OVERWROTE `Player.score` with the round's score instead of
  // adding to it. A game could not reach a target it threw away every round.
  // ---------------------------------------------------------------------
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
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "round_over", winnerPlayerId: null },
      });
    });

    it("ends the GAME when the leader's cumulative score reaches the target", async () => {
      // caller carries 95 in from previous rounds and scores 10 => 105 >= 100.
      mockBlitz(blitzGame({ targetScore: 100, callerScore: 95 }));

      const result = await service.callBlitz("game-1", "p1");

      expect(result.status).toBe("finished");
      expect(result.winnerId).toBe("p1");
      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: { status: "finished", winnerPlayerId: "p1" },
      });
    });

    it("crosses the target on the CUMULATIVE total, not the round's score", async () => {
      // The round itself only scores 10 - nowhere near 100. It is the running
      // total that ends the game, which is exactly what overwriting `score`
      // made impossible.
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

      // p1: 20 carried + 10 this round = 30. The old code wrote 10.
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

    // The property the whole locking story buys: the second caller into the
    // lock observes the first's committed status and bails. Here the status is
    // simply already `round_over`, which is what that caller would read.
    it("refuses a Blitz on a game that is no longer playing", async () => {
      // Exactly what the loser of a two-caller race reads once it gets into
      // the lock: the winner already committed, and the status says so.
      mockBlitz({ ...blitzGame({ targetScore: 100 }), status: "round_over" });

      await expect(service.callBlitz("game-1", "p1")).rejects.toThrow(
        "Game is not in progress"
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.roundResult.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------
    // updateGameStats had ZERO callers before this - gamesPlayed and
    // gamesWon were permanently 0 for every user in the system.
    // -----------------------------------------------------------------
    it("credits every player's stats exactly once when the game finishes", async () => {
      mockBlitz(blitzGame({ targetScore: 12, callerScore: 5 }));

      await service.callBlitz("game-1", "p1");

      const calls = (prismaService.user.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );

      expect(calls).toHaveLength(2);
      // The winner: played one, won one.
      expect(calls).toContainEqual({
        where: { id: "user-b" },
        data: { gamesPlayed: { increment: 1 }, gamesWon: { increment: 1 } },
      });
      // The loser: played one, won none. `gamesWon` is absent, not 0.
      expect(calls).toContainEqual({
        where: { id: "user-a" },
        data: { gamesPlayed: { increment: 1 } },
      });
    });

    it("orders the stats writes by userId ASC to avoid cross-game deadlocks", async () => {
      // The player ROWS are ordered p1 (user-b) then p2 (user-a): if the sort
      // were dropped, the writes would come out in that order and this fails.
      // Two games finishing at once with these same two players, each locking
      // them in its own order, is a deadlock - see UserService.recordGameResults.
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

  describe("startNextRound", () => {
    function roundOverGame(overrides: Record<string, unknown> = {}) {
      return gameRow({
        status: "round_over",
        currentRound: 2,
        hostId: "host-user",
        gameState: { bankPiles: [] },
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
            isReady: true,
            score: 12,
            roundScore: -2,
            bankPileCount: 4,
          }),
        ],
        ...overrides,
      });
    }

    function mockAdvance(game: unknown) {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(game);
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
    }

    it("increments currentRound and re-deals a fresh 40-card deck to every player", async () => {
      mockAdvance(roundOverGame());

      await service.startNextRound("game-1", "host-user");

      expect(prismaService.game.update).toHaveBeenCalledWith({
        where: { id: "game-1" },
        data: expect.objectContaining({
          status: "playing",
          currentRound: { increment: 1 },
        }),
      });

      const updates = (prismaService.player.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );
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

      await service.startNextRound("game-1", "host-user");

      const updates = (prismaService.player.update as jest.Mock).mock.calls.map(
        (c) => c[0]
      );

      for (const update of updates) {
        expect(update.data.bankPileCount).toBe(0);
        expect(update.data.roundScore).toBe(0);
        expect(update.data.isReady).toBe(false);
        // THE line that matters. `score` is the running total the game is
        // played to; a round advance that reset it would make the target
        // unreachable and every previous round pointless.
        expect(update.data).not.toHaveProperty("score");
      }
    });

    it("resets the shared bank piles", async () => {
      mockAdvance(roundOverGame());

      await service.startNextRound("game-1", "host-user");

      const gameUpdate = (prismaService.game.update as jest.Mock).mock.calls[0][0];
      const bankPiles = gameUpdate.data.gameState.bankPiles;
      // Fresh, empty foundations - last round's runs are scored and gone.
      expect(bankPiles.length).toBeGreaterThan(0);
      expect(bankPiles.every((p: { cards: unknown[] }) => p.cards.length === 0)).toBe(
        true
      );
    });

    // The gate `isReady` finally exists for - and the same predicate that
    // gates startGame (`assertReadyToDeal`).
    it("rejects the advance unless ALL players are ready", async () => {
      mockAdvance(
        roundOverGame({
          players: [
            playerRow("p1", null, { userId: "host-user", isReady: true }),
            playerRow("p2", null, { userId: "other-user", isReady: false }),
          ],
        })
      );

      await expect(
        service.startNextRound("game-1", "host-user")
      ).rejects.toThrow("All players must be ready to start the next round");

      expect(prismaService.player.update).not.toHaveBeenCalled();
      expect(prismaService.game.update).not.toHaveBeenCalled();
    });

    it("rejects the advance when the game's round is not over", async () => {
      mockAdvance(roundOverGame({ status: "playing" }));

      await expect(
        service.startNextRound("game-1", "host-user")
      ).rejects.toThrow("The round is not over");

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("rejects a non-host trying to deal the next round", async () => {
      mockAdvance(roundOverGame());

      await expect(
        service.startNextRound("game-1", "other-user")
      ).rejects.toThrow("Only the host can start the next round");

      expect(prismaService.player.update).not.toHaveBeenCalled();
    });

    it("does all of its work inside the game lock", async () => {
      mockAdvance(roundOverGame());

      await service.startNextRound("game-1", "host-user");

      expect(gameRepository.withGameLock).toHaveBeenCalledWith(
        "game-1",
        expect.any(Function)
      );
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
