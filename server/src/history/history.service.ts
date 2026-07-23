import { Injectable } from "@nestjs/common";
import { PrismaService } from "@prisma";
import { MatchHistoryItem } from "@blurtz/shared";

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
}
