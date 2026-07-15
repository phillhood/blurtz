import { Test, TestingModule } from "@nestjs/testing";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "@prisma";
import { GameService } from "./game.service";
import { GameRepository } from "./game.repository";
import { Card, MoveResult, PlayerDeck, Pile } from "@types";
import { CARD_COLORS, CARD_VALUES } from "@utils";

/**
 * Integration spec - needs a REAL Postgres. Every other spec in this repo
 * mocks PrismaService; this one cannot, because the thing under test IS the
 * database's row lock.
 *
 *   docker compose up -d db
 *   cd server && npx jest src/game/game.concurrency.spec.ts
 *
 * It talks to `blurtz_test`, never the dev database, and cleans up after
 * itself so it is re-runnable without manual surgery.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://blurtz:blurtz@localhost:5442/blurtz_test?schema=public";

/** Everything this suite creates is tagged, so cleanup can find it. */
const TEST_TAG = "concurrency-spec";

const CARDS_PER_PLAYER = 40;

jest.setTimeout(30000);

function fullDeck(): Card[] {
  const cards: Card[] = [];

  Object.values(CARD_COLORS).forEach((color) => {
    CARD_VALUES.forEach((value) => {
      cards.push({ id: uuidv4(), value, number: value, color, faceUp: false });
    });
  });

  return cards;
}

/**
 * A realistic 40-card deck whose only immediately-playable card is the red
 * ace, sitting alone and face-up on the first work pile.
 *
 * Both players get one of these. Both aces are red 1s, and there is exactly
 * one empty bank pile - so both moves are legal at the moment they are read,
 * and only one of them can still be legal by the time it is written. That is
 * the whole race, reduced to two cards.
 */
function buildDeck(): { deck: PlayerDeck; aceId: string; workPileId: string } {
  const cards = fullDeck();

  const aceIndex = cards.findIndex(
    (c) => c.value === 1 && c.color.name === CARD_COLORS.RED.name
  );
  const [ace] = cards.splice(aceIndex, 1);
  ace.faceUp = true;

  const blurtzCards = cards.splice(0, 10);
  blurtzCards.forEach((c, i) => (c.faceUp = i === blurtzCards.length - 1));

  const otherWorkCards = cards.splice(0, 4);
  otherWorkCards.forEach((c) => (c.faceUp = true));

  const workPiles: Pile[] = [
    { id: uuidv4(), type: "work", cards: [ace] },
    ...otherWorkCards.map((c) => ({
      id: uuidv4(),
      type: "work" as const,
      cards: [c],
    })),
  ];

  const deck: PlayerDeck = {
    blurtzPile: { id: uuidv4(), type: "blurtz", cards: blurtzCards },
    workPiles,
    drawPile: { id: uuidv4(), type: "draw", cards },
  };

  return { deck, aceId: ace.id, workPileId: workPiles[0].id };
}

function countDeckCards(deck: PlayerDeck): number {
  return (
    deck.blurtzPile.cards.length +
    deck.drawPile.cards.length +
    deck.workPiles.reduce((total, pile) => total + pile.cards.length, 0)
  );
}

function deckCardIds(deck: PlayerDeck): string[] {
  return [
    ...deck.blurtzPile.cards,
    ...deck.drawPile.cards,
    ...deck.workPiles.flatMap((p) => p.cards),
  ].map((c) => c.id);
}

describe("GameService concurrency (real database)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: GameService;

  let gameId: string;
  let bankPileId: string;
  let playerOne: { id: string; aceId: string; workPileId: string };
  let playerTwo: { id: string; aceId: string; workPileId: string };

  /** Cards across every player's deck plus the shared bank piles. */
  async function census(): Promise<{
    total: number;
    ids: string[];
    bankCards: number;
    bankPileCounts: number[];
  }> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { orderBy: { id: "asc" } } },
    });

    const decks = game.players.map((p) => p.deck as unknown as PlayerDeck);
    const bankPiles = (game.gameState as any).bankPiles as Pile[];

    const ids = [
      ...decks.flatMap(deckCardIds),
      ...bankPiles.flatMap((p) => p.cards.map((c) => c.id)),
    ];

    return {
      total:
        decks.reduce((sum, deck) => sum + countDeckCards(deck), 0) +
        bankPiles.reduce((sum, pile) => sum + pile.cards.length, 0),
      ids,
      bankCards: bankPiles.reduce((sum, pile) => sum + pile.cards.length, 0),
      bankPileCounts: game.players.map((p) => p.bankPileCount),
    };
  }

  async function cleanup() {
    // Games cascade to players and snapshots; users have to go after them.
    await prisma.game.deleteMany({ where: { name: TEST_TAG } });
    await prisma.user.deleteMany({ where: { password: TEST_TAG } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    module = await Test.createTestingModule({
      providers: [GameService, GameRepository, PrismaService],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(GameService);

    await prisma.$connect();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    // close() runs PrismaService's onModuleDestroy, which ends the pg pool -
    // otherwise its sockets keep the jest worker alive.
    await module.close();
  });

  beforeEach(async () => {
    await cleanup();

    const userOne = await prisma.user.create({
      data: { username: `race-one-${uuidv4()}`, password: TEST_TAG },
    });
    const userTwo = await prisma.user.create({
      data: { username: `race-two-${uuidv4()}`, password: TEST_TAG },
    });

    bankPileId = uuidv4();
    const game = await prisma.game.create({
      data: {
        name: TEST_TAG,
        alias: uuidv4().slice(0, 8).toUpperCase(),
        maxPlayers: 2,
        status: "playing",
        hostId: userOne.id,
        gameState: {
          // One empty bank pile: the single contended resource.
          bankPiles: [{ id: bankPileId, type: "bank", cards: [] }],
          currentTurn: 0,
        },
      },
    });
    gameId = game.id;

    const deckOne = buildDeck();
    const deckTwo = buildDeck();

    const rowOne = await prisma.player.create({
      data: {
        userId: userOne.id,
        gameId: game.id,
        deck: JSON.parse(JSON.stringify(deckOne.deck)),
      },
    });
    const rowTwo = await prisma.player.create({
      data: {
        userId: userTwo.id,
        gameId: game.id,
        deck: JSON.parse(JSON.stringify(deckTwo.deck)),
      },
    });

    playerOne = { id: rowOne.id, ...deckOne };
    playerTwo = { id: rowTwo.id, ...deckTwo };
  });

  describe("two players racing the same bank pile with the same card", () => {
    /**
     * Fire both moves genuinely concurrently. Run sequentially this proves
     * nothing - it passed against the unlocked code too.
     */
    async function race(): Promise<MoveResult[]> {
      return Promise.all([
        service.moveCard(
          gameId,
          playerOne.id,
          playerOne.aceId,
          playerOne.workPileId,
          bankPileId
        ),
        service.moveCard(
          gameId,
          playerTwo.id,
          playerTwo.aceId,
          playerTwo.workPileId,
          bankPileId
        ),
      ]);
    }

    it("lets exactly one player win, and tells the other why they lost", async () => {
      const results = await race();

      const accepted = results.filter((r) => r.ok);
      const rejected = results.filter((r) => !r.ok);

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The loser gets state back, not a bare error - it is what lets their
      // board un-hide the card that never moved.
      const loss = rejected[0] as Extract<MoveResult, { ok: false }>;
      expect(loss.state).toBeDefined();
      expect(loss.state.id).toBe(gameId);
      expect(loss.reason).toBe("That card no longer fits on that bank pile");
    });

    it("loses no card and duplicates none", async () => {
      const before = await census();
      expect(before.total).toBe(CARDS_PER_PLAYER * 2);

      await race();

      const after = await census();

      // The invariant that matters: a card is somewhere, exactly once. The
      // unlocked code dropped one on the floor here - both players' decks lost
      // their ace, but only one ace reached a bank pile.
      expect(after.total).toBe(CARDS_PER_PLAYER * 2);
      expect(new Set(after.ids).size).toBe(after.ids.length);
      expect(new Set(after.ids)).toEqual(new Set(before.ids));

      // Exactly one ace made it onto the contended pile.
      expect(after.bankCards).toBe(1);
    });

    it("credits bankPileCount exactly once", async () => {
      await race();

      const { bankPileCounts } = await census();

      // Unlocked, both players were credited for the same single card.
      expect(bankPileCounts.reduce((a, b) => a + b, 0)).toBe(1);
      expect(bankPileCounts.filter((c) => c === 1)).toHaveLength(1);
      expect(bankPileCounts.filter((c) => c === 0)).toHaveLength(1);
    });

    it("leaves the winner's card on the pile and the loser's in their work pile", async () => {
      const results = await race();
      const winnerIndex = results.findIndex((r) => r.ok);
      const winner = winnerIndex === 0 ? playerOne : playerTwo;
      const loser = winnerIndex === 0 ? playerTwo : playerOne;

      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { players: true },
      });

      const bankPile = (game.gameState as any).bankPiles[0] as Pile;
      expect(bankPile.cards.map((c) => c.id)).toEqual([winner.aceId]);

      const loserDeck = game.players.find((p) => p.id === loser.id)
        .deck as unknown as PlayerDeck;
      const loserWorkPile = loserDeck.workPiles.find(
        (p) => p.id === loser.workPileId
      );

      // The rejected move must not have half-applied: the card is still
      // exactly where it started.
      expect(loserWorkPile.cards.map((c) => c.id)).toEqual([loser.aceId]);
    });
  });

  // -------------------------------------------------------------------
  // Item 7: joinGame is check-then-create, so concurrent joins used to be
  // able to seat the same user twice.
  // -------------------------------------------------------------------
  describe("concurrent joins by the same user", () => {
    it("creates exactly one player row", async () => {
      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 4,
          status: "waiting",
          hostId: "nobody",
          gameState: { bankPiles: [], currentTurn: 0 },
        },
      });
      const user = await prisma.user.create({
        data: { username: `joiner-${uuidv4()}`, password: TEST_TAG },
      });

      const results = await Promise.allSettled([
        service.joinGame(game.id, user.id),
        service.joinGame(game.id, user.id),
      ]);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const players = await prisma.player.findMany({
        where: { gameId: game.id, userId: user.id },
      });
      expect(players).toHaveLength(1);
    });
  });
});
