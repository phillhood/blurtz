import { Test } from "@nestjs/testing";
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
