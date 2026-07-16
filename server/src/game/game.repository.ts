import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@prisma";

/**
 * How long a statement waits for a contended row lock before giving up.
 *
 * Nertz is simultaneous-play, so lock waits are the normal case - but they are
 * measured in milliseconds. A wait that reaches this bound means something is
 * genuinely wrong (a stuck transaction, a dead connection), and failing fast
 * beats hanging a socket handler with the player staring at a frozen board.
 */
const LOCK_TIMEOUT = "3s";

/**
 * A Prisma client that may or may not be a transaction.
 *
 * `PrismaService` is assignable to this, so read-only helpers can be handed
 * either the pooled client or a `withGameLock` transaction and behave the
 * same. Anything that WRITES must only ever be given the transaction.
 */
export type DbClient = Prisma.TransactionClient;

@Injectable()
export class GameRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Run `fn` with the game's row exclusively locked.
   *
   * Nertz has every player playing at once, and racing another player to the
   * same bank pile IS the game. Unserialized, two moves landing at the same
   * instant are two read-modify-write cycles over the same JSON blobs, and the
   * loser's write silently erases the winner's: a card vanishes from the table
   * and `bankPileCount` is credited twice.
   *
   * The contended state is exactly one row's worth - `games.game_state` (the
   * shared bank piles) plus the `players` rows scored against it - so the game
   * row is the serialization point. Every mutator takes this lock, which makes
   * concurrent moves on one game queue up and each observe the previous one's
   * committed result.
   *
   * `fn` MUST use the `tx` client it is handed for every read and write.
   * Reaching for the outer PrismaService inside the callback issues the query
   * on a different connection, outside this transaction - it escapes both the
   * lock and the atomicity, and silently reintroduces the exact race this
   * exists to prevent.
   */
  async withGameLock<T>(
    gameId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // SET LOCAL is scoped to this transaction, so it cannot leak onto the
        // next checkout of this pooled connection.
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

        // `games.id` is Postgres `text`, not `uuid` - do not add a ::uuid cast.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new NotFoundException("Game not found");
        }

        return fn(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }
}
