import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@prisma";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });
  }

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    if (!user) {
      return null;
    }

    const winRate = user.gamesPlayed > 0 ? user.gamesWon / user.gamesPlayed : 0;

    return {
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesPlayed - user.gamesWon,
      winRate: Math.round(winRate * 100),
    };
  }

  /**
   * Credit one user with a finished game.
   *
   * `client` defaults to the pooled client but is meant to be handed the game's
   * transaction: stats that commit separately from the game that produced them
   * can be credited for a game that then rolls back. Two concurrent Blitz calls
   * race for one game and exactly one loses - the loser must not leave a
   * `gamesPlayed` behind it.
   *
   * Callers with more than one user to credit must go through
   * `recordGameResults`, not loop over this. See the ordering note there.
   */
  async updateGameStats(
    userId: string,
    won: boolean,
    client: Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    await client.user.update({
      where: { id: userId },
      data: {
        gamesPlayed: { increment: 1 },
        ...(won && { gamesWon: { increment: 1 } }),
      },
    });
  }

  /**
   * Record a finished game for every player who was in it.
   *
   * THE SORT IS LOAD-BEARING. DO NOT REMOVE IT.
   *
   * These updates run inside the game's transaction, so each one holds a row
   * lock on its user until that transaction commits. Two different games
   * finishing at the same moment with overlapping players will each hold one
   * user row and block on the other's:
   *
   *   game A (users X, Y): locks X, waits for Y
   *   game B (users Y, X): locks Y, waits for X   -> deadlock
   *
   * Postgres detects the cycle and kills one of them, so a game that was
   * legitimately won just fails to finish. Acquiring the rows in one total
   * order shared by every caller makes the cycle impossible to form: both
   * transactions reach for X first and the loser simply waits its turn.
   *
   * This is the specific case that "each statement only touches one row, so it
   * cannot deadlock" does not cover. That reasoning is sound for a single
   * update and false the moment a transaction takes a second lock.
   */
  async recordGameResults(
    client: Prisma.TransactionClient,
    results: Array<{ userId: string; won: boolean }>
  ): Promise<void> {
    // Plain code-unit comparison, not localeCompare: what matters is that
    // every caller derives the SAME order from the same ids, and a
    // locale-sensitive collation is not a guarantee of that.
    const ordered = [...results].sort((a, b) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
    );

    for (const { userId, won } of ordered) {
      await this.updateGameStats(userId, won, client);
    }
  }
}
