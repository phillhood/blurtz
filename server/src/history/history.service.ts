import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@prisma";
import { GameResultsDetail, GameRoundResult, MatchHistoryItem } from "@blurtz/shared";

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async getMatchHistory(userId: string): Promise<MatchHistoryItem[]> {
    const games = await this.prisma.game.findMany({
      where: { status: "finished", players: { some: { userId } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        createdAt: true,
        targetScore: true,
        currentRound: true,
        winnerPlayerId: true,
        players: {
          select: {
            id: true,
            userId: true,
            score: true,
            user: { select: { username: true } },
          },
        },
      },
    });

    return games.map((game) => {
      const mine = game.players.find((p) => p.userId === userId);
      const players = game.players
        .map((p) => ({ username: p.user.username, finalScore: p.score }))
        .sort((a, b) => b.finalScore - a.finalScore);
      return {
        gameId: game.id,
        name: game.name,
        playedAt: game.createdAt.toISOString(),
        targetScore: game.targetScore,
        rounds: game.currentRound,
        players,
        myScore: mine?.score ?? 0,
        won: !!game.winnerPlayerId && game.winnerPlayerId === mine?.id,
      };
    });
  }

  async getGameResults(gameId: string, userId: string): Promise<GameResultsDetail> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        name: true,
        targetScore: true,
        winnerPlayerId: true,
        players: {
          select: { id: true, userId: true, user: { select: { username: true } } },
        },
      },
    });
    if (!game || !game.players.some((p) => p.userId === userId)) {
      throw new ForbiddenException("Not a player in this game");
    }

    const rows = await this.prisma.roundResult.findMany({
      where: { gameId },
      orderBy: [{ round: "asc" }, { playerId: "asc" }],
      select: {
        round: true,
        roundScore: true,
        cumulativeScore: true,
        bankPileCount: true,
        blurtzRemaining: true,
        calledBlurtz: true,
        player: { select: { user: { select: { username: true } } } },
      },
    });

    const byRound = new Map<number, GameRoundResult[]>();
    for (const r of rows) {
      const list = byRound.get(r.round) ?? [];
      list.push({
        username: r.player.user.username,
        roundScore: r.roundScore,
        cumulativeScore: r.cumulativeScore,
        bankPileCount: r.bankPileCount,
        blurtzRemaining: r.blurtzRemaining,
        calledBlurtz: r.calledBlurtz,
      });
      byRound.set(r.round, list);
    }
    const rounds = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, results]) => ({ round, results }));

    const winner = game.players.find((p) => p.id === game.winnerPlayerId);
    return {
      gameId: game.id,
      name: game.name,
      targetScore: game.targetScore,
      winnerUsername: winner?.user.username ?? null,
      rounds,
    };
  }
}
