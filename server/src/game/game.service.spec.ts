import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
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
        update: jest.fn(),
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
        players: [{ id: "p1" }, { id: "p2" }],
      });

      await expect(service.startGame("game-1")).rejects.toThrow(
        BadRequestException
      );

      expect(prismaService.player.update).not.toHaveBeenCalled();
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
});
