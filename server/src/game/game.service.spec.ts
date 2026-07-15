import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GameService } from "./game.service";
import { PrismaService } from "@prisma";
import { CARD_COLORS } from "@utils";
import { Card } from "@types";

// Small helper to keep card fixtures short and consistent.
function card(id: string, value: number, color = CARD_COLORS.RED, faceUp = true): Card {
  return { id, value, number: value, color, faceUp };
}

describe("GameService", () => {
  let service: GameService;
  let prismaService: jest.Mocked<PrismaService>;

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
      },
      user: {
        findUnique: jest.fn(),
      },
      gameSnapshot: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // Item 1: findGameByAlias must not leak password hashes via `user: true`.
  // ---------------------------------------------------------------------
  describe("findGameByAlias", () => {
    it("requests a narrowed user selection, not the full user record", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue(null);

      await service.findGameByAlias("ABC123");

      expect(prismaService.game.findUnique).toHaveBeenCalledWith({
        where: { alias: "ABC123" },
        include: {
          players: {
            include: {
              user: { select: { id: true, username: true } },
            },
          },
        },
      });

      const callArg = (prismaService.game.findUnique as jest.Mock).mock
        .calls[0][0];
      // Explicitly guard against a regression back to `include: { user: true }`.
      expect(callArg.include.players.include.user).not.toBe(true);
      expect(callArg.include.players.include).not.toEqual({ user: true });
    });
  });

  // ---------------------------------------------------------------------
  // Item 3 & 4: moveCard / executeMove stack-move + bank-pile behaviour.
  // ---------------------------------------------------------------------
  describe("moveCard", () => {
    it("moves exactly ONE card from a work pile to a bank pile, not the whole stack", async () => {
      const cardA = card("card-a", 1, CARD_COLORS.RED); // bottom of stack, playable target
      const cardB = card("card-b", 9, CARD_COLORS.BLUE); // stacked above cardA
      const cardC = card("card-c", 2, CARD_COLORS.YELLOW); // stacked above cardB

      const workPile = { id: "work-1", type: "work", cards: [cardA, cardB, cardC] };
      const bankPile = { id: "bank-1", type: "bank", cards: [] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPile],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [bankPile], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "playing",
        gameState,
        players: [{ id: "player-1", deck: playerDeck }],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        "card-a",
        "work-1",
        "bank-1"
      );

      expect(result).toBe(true);

      const playerUpdateArg = (prismaService.player.update as jest.Mock).mock
        .calls[0][0];
      const updatedWorkPile = playerUpdateArg.data.deck.workPiles[0];
      expect(updatedWorkPile.cards).toHaveLength(2);
      expect(updatedWorkPile.cards.map((c: Card) => c.id)).toEqual([
        "card-b",
        "card-c",
      ]);
      expect(playerUpdateArg.data.bankPileCount).toEqual({ increment: 1 });

      const gameUpdateArg = (prismaService.game.update as jest.Mock).mock
        .calls[0][0];
      const updatedBankPile = gameUpdateArg.data.gameState.bankPiles[0];
      expect(updatedBankPile.cards).toHaveLength(1);
      expect(updatedBankPile.cards[0].id).toBe("card-a");
    });

    it("moves the card AND everything stacked above it for a work-to-work move", async () => {
      const cardA = card("card-a", 1, CARD_COLORS.RED);
      const cardB = card("card-b", 9, CARD_COLORS.BLUE);
      const cardC = card("card-c", 2, CARD_COLORS.YELLOW);

      const workPileFrom = { id: "work-1", type: "work", cards: [cardA, cardB, cardC] };
      const workPileTo = { id: "work-2", type: "work", cards: [] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPileFrom, workPileTo],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "playing",
        gameState,
        players: [{ id: "player-1", deck: playerDeck }],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        "card-a",
        "work-1",
        "work-2"
      );

      expect(result).toBe(true);

      const playerUpdateArg = (prismaService.player.update as jest.Mock).mock
        .calls[0][0];
      const [updatedFrom, updatedTo] = playerUpdateArg.data.deck.workPiles;
      expect(updatedFrom.cards).toHaveLength(0);
      expect(updatedTo.cards.map((c: Card) => c.id)).toEqual([
        "card-a",
        "card-b",
        "card-c",
      ]);
      // A work-to-work move is not a bank move.
      expect(playerUpdateArg.data.bankPileCount).toBeUndefined();
    });

    it("does NOT clear a bank pile once it reaches 10 cards", async () => {
      const bankCards = Array.from({ length: 9 }, (_, i) =>
        card(`bank-card-${i + 1}`, i + 1, CARD_COLORS.RED)
      );
      const bankPile = { id: "bank-1", type: "bank", cards: bankCards };

      const tenthCard = card("card-10", 10, CARD_COLORS.RED);
      const workPile = { id: "work-1", type: "work", cards: [tenthCard] };

      const playerDeck = {
        blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
        workPiles: [workPile],
        drawPile: { id: "draw-1", type: "draw", cards: [] },
      };

      const gameState = { bankPiles: [bankPile], currentTurn: 0 };

      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "playing",
        gameState,
        players: [{ id: "player-1", deck: playerDeck }],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});

      const result = await service.moveCard(
        "game-1",
        "player-1",
        "card-10",
        "work-1",
        "bank-1"
      );

      expect(result).toBe(true);

      const gameUpdateArg = (prismaService.game.update as jest.Mock).mock
        .calls[0][0];
      const updatedBankPile = gameUpdateArg.data.gameState.bankPiles[0];
      // Full pile is inert but must NOT be cleared for reuse.
      expect(updatedBankPile.cards).toHaveLength(10);
      expect(updatedBankPile.cards[9].id).toBe("card-10");
    });

    // -------------------------------------------------------------------
    // Item 6: status guards.
    // -------------------------------------------------------------------
    it("throws BadRequestException when the game is not in progress", async () => {
      (prismaService.game.findUnique as jest.Mock).mockResolvedValue({
        id: "game-1",
        status: "waiting",
        gameState: { bankPiles: [], currentTurn: 0 },
        players: [],
      });

      await expect(
        service.moveCard("game-1", "player-1", "card-a", "work-1", "bank-1")
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.player.update).not.toHaveBeenCalled();
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
        winnerId: null,
        gameState: { bankPiles: [], currentTurn: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        players: [
          {
            id: "p1",
            userId: "host-user",
            isReady: true,
            score: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "host-user", username: "host" },
          },
          {
            id: "p2",
            userId: "other-user",
            isReady: true,
            score: 0,
            bankPileCount: 0,
            deck: null,
            user: { id: "other-user", username: "guest" },
          },
        ],
      });
      (prismaService.player.update as jest.Mock).mockResolvedValue({});
      (prismaService.game.update as jest.Mock).mockResolvedValue({});
      (prismaService.gameSnapshot.create as jest.Mock).mockResolvedValue({});

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
});
