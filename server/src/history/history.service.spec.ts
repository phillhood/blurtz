import { Test } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { HistoryService } from "./history.service";
import { PrismaService } from "@prisma";

describe("HistoryService.getMatchHistory", () => {
  let service: HistoryService;
  let prisma: { game: { findMany: jest.Mock }; roundResult: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { game: { findMany: jest.fn() }, roundResult: { findMany: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HistoryService);
  });

  it("maps finished games, sorts players desc, and flags the win", async () => {
    prisma.game.findMany.mockResolvedValue([
      {
        id: "g1", name: "G", createdAt: new Date("2026-07-01T00:00:00Z"),
        targetScore: 100, currentRound: 3, winnerPlayerId: "p-me",
        players: [
          { id: "p-me", userId: "u-me", score: 100, user: { username: "me" } },
          { id: "p-op", userId: "u-op", score: 40, user: { username: "op" } },
        ],
      },
    ]);

    const [item] = await service.getMatchHistory("u-me");

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "finished", players: { some: { userId: "u-me" } } }, take: 50 })
    );
    expect(item).toEqual({
      gameId: "g1", name: "G", playedAt: "2026-07-01T00:00:00.000Z",
      targetScore: 100, rounds: 3,
      players: [{ username: "me", finalScore: 100 }, { username: "op", finalScore: 40 }],
      myScore: 100, won: true,
    });
  });

  it("won is false when someone else won", async () => {
    prisma.game.findMany.mockResolvedValue([
      { id: "g2", name: "G", createdAt: new Date(), targetScore: 50, currentRound: 2,
        winnerPlayerId: "p-op",
        players: [
          { id: "p-me", userId: "u-me", score: 10, user: { username: "me" } },
          { id: "p-op", userId: "u-op", score: 50, user: { username: "op" } },
        ] },
    ]);
    const [item] = await service.getMatchHistory("u-me");
    expect(item.won).toBe(false);
    expect(item.myScore).toBe(10);
  });
});

describe("HistoryService.getGameResults", () => {
  let service: HistoryService;
  let prisma: { game: { findUnique: jest.Mock }; roundResult: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { game: { findUnique: jest.fn() }, roundResult: { findMany: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HistoryService);
  });

  const gameRow = {
    id: "g1", name: "G", targetScore: 100, winnerPlayerId: "p-me",
    players: [
      { id: "p-me", userId: "u-me", user: { username: "me" } },
      { id: "p-op", userId: "u-op", user: { username: "op" } },
    ],
  };

  it("403s a missing game (no id probing)", async () => {
    prisma.game.findUnique.mockResolvedValue(null);
    await expect(service.getGameResults("nope", "u-me")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("403s a non-member", async () => {
    prisma.game.findUnique.mockResolvedValue(gameRow);
    await expect(service.getGameResults("g1", "u-stranger")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("groups round results by round with usernames and winner", async () => {
    prisma.game.findUnique.mockResolvedValue(gameRow);
    prisma.roundResult.findMany.mockResolvedValue([
      { round: 1, roundScore: 5, cumulativeScore: 5, bankPileCount: 7, blurtzRemaining: 1, calledBlurtz: false, player: { user: { username: "me" } } },
      { round: 1, roundScore: 3, cumulativeScore: 3, bankPileCount: 5, blurtzRemaining: 1, calledBlurtz: true, player: { user: { username: "op" } } },
      { round: 2, roundScore: 9, cumulativeScore: 14, bankPileCount: 9, blurtzRemaining: 0, calledBlurtz: true, player: { user: { username: "me" } } },
    ]);

    const res = await service.getGameResults("g1", "u-me");

    expect(res.winnerUsername).toBe("me");
    expect(res.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(res.rounds[0].results).toHaveLength(2);
    expect(res.rounds[0].results[0]).toEqual({
      username: "me", roundScore: 5, cumulativeScore: 5, bankPileCount: 7, blurtzRemaining: 1, calledBlurtz: false,
    });
    expect(res.rounds[1].results).toHaveLength(1);
  });
});
