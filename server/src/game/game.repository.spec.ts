import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { GameRepository } from "./game.repository";
import { PrismaService } from "@prisma";

/**
 * The mechanics of the lock, with a mocked client. That it actually
 * serializes two racing players is proven against a real Postgres in
 * game.concurrency.spec.ts - this spec is about the statements it issues and
 * the order it issues them in.
 */
describe("GameRepository", () => {
  let repository: GameRepository;
  let tx: {
    $executeRawUnsafe: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let transactionOptions: unknown;

  const GAME_ID = "game-1";

  beforeEach(async () => {
    tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      // The game row exists by default.
      $queryRaw: jest.fn().mockResolvedValue([{ id: GAME_ID }]),
    };

    const mockPrismaService = {
      $transaction: jest.fn((fn: (client: unknown) => unknown, options: unknown) => {
        transactionOptions = options;
        return fn(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    repository = module.get(GameRepository);
  });

  it("runs the callback inside a Read Committed transaction", async () => {
    await repository.withGameLock(GAME_ID, async () => "done");

    expect(transactionOptions).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it("hands the callback the transaction client, not the pooled one", async () => {
    const fn = jest.fn().mockResolvedValue("done");

    await repository.withGameLock(GAME_ID, fn);

    // Everything inside the lock must run on this client - the outer client
    // would issue queries on another connection, outside the transaction.
    expect(fn).toHaveBeenCalledWith(tx);
  });

  it("returns the callback's value", async () => {
    await expect(
      repository.withGameLock(GAME_ID, async () => ({ moved: true }))
    ).resolves.toEqual({ moved: true });
  });

  it("bounds the lock wait so a stuck lock cannot hang a socket handler", async () => {
    await repository.withGameLock(GAME_ID, async () => "done");

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL lock_timeout = '3s'"
    );
  });

  it("takes the row lock BEFORE running the callback", async () => {
    const order: string[] = [];

    tx.$executeRawUnsafe.mockImplementation(async () => {
      order.push("lock_timeout");
      return 0;
    });
    tx.$queryRaw.mockImplementation(async () => {
      order.push("select_for_update");
      return [{ id: GAME_ID }];
    });

    await repository.withGameLock(GAME_ID, async () => {
      order.push("callback");
      return "done";
    });

    // If the callback read anything before the lock was held, it could read a
    // state another transaction is about to overwrite - the whole point is to
    // read AFTER acquiring.
    expect(order).toEqual(["lock_timeout", "select_for_update", "callback"]);
  });

  it("locks the game row with SELECT ... FOR UPDATE, parameterised", async () => {
    await repository.withGameLock(GAME_ID, async () => "done");

    const [strings, ...values] = tx.$queryRaw.mock.calls[0];
    const sql = strings.join("?");

    expect(sql).toContain("FROM games");
    expect(sql).toContain("FOR UPDATE");
    // `games.id` is Postgres `text`, not `uuid` - a ::uuid cast here throws.
    expect(sql).not.toContain("::uuid");
    expect(values).toEqual([GAME_ID]);
  });

  it("throws NotFound when the game does not exist, without running the callback", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    const fn = jest.fn();

    await expect(repository.withGameLock(GAME_ID, fn)).rejects.toThrow(
      NotFoundException
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("propagates a failure out of the callback so the transaction rolls back", async () => {
    const boom = new Error("move blew up");

    await expect(
      repository.withGameLock(GAME_ID, async () => {
        throw boom;
      })
    ).rejects.toThrow(boom);
  });
});
