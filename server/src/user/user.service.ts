import { Injectable } from "@nestjs/common";
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

  async updateGameStats(userId: string, won: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        gamesPlayed: { increment: 1 },
        ...(won && { gamesWon: { increment: 1 } }),
      },
    });
  }
}
