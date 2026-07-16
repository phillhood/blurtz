import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "@prisma";
import { UserService } from "@user/user.service";
import { GameService } from "./game.service";
import { GameRepository } from "./game.repository";
import {
  Card,
  CARD_COLORS,
  CARD_VALUES,
  MoveResult,
  Pile,
  PlayerDeck,
} from "@blurtz/shared";

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
      cards.push({ id: uuidv4(), value, color, faceUp: false });
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
    // Games cascade to players and round results; users have to go after them.
    // The winner FK is ON DELETE SET NULL precisely so this works: deleting a
    // game deletes its players, and the game row those players are the winner
    // of is nulled on its way out rather than blocking the delete.
    await prisma.game.deleteMany({ where: { name: TEST_TAG } });
    await prisma.user.deleteMany({ where: { password: TEST_TAG } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    module = await Test.createTestingModule({
      // UserService for real, on the real database: finishing a game credits
      // gamesPlayed/gamesWon inside the game's own transaction, so it is part
      // of what these races are testing rather than a collaborator to stub.
      providers: [GameService, GameRepository, PrismaService, UserService],
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
     * Fire both moves genuinely concurrently. Run sequentially, this proves
     * nothing - the unlocked code passes it too.
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

      // The invariant that matters: a card is somewhere, exactly once. Unlocked,
      // one is dropped on the floor - both players' decks lose their ace, but
      // only one ace reaches a bank pile.
      expect(after.total).toBe(CARDS_PER_PLAYER * 2);
      expect(new Set(after.ids).size).toBe(after.ids.length);
      expect(new Set(after.ids)).toEqual(new Set(before.ids));

      // Exactly one ace made it onto the contended pile.
      expect(after.bankCards).toBe(1);
    });

    it("credits bankPileCount exactly once", async () => {
      await race();

      const { bankPileCounts } = await census();

      // Unlocked, both players are credited for the same single card.
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

  // A forfeit that reads the game outside the lock reads the pre-Blitz "playing"
  // row, computes a winner from it in JS, then blocks on the row lock - waiting
  // for the Blitz to commit before writing its stale winner over the top.
  describe("a forfeit racing a Blitz", () => {
    let raceGameId: string;
    /** Empty Blurtz pile, so this is the only player allowed to call Blitz. */
    let blitzCaller: string;
    /** Banked the most, so a Blitz crowns THEM - and they are the one leaving. */
    let forfeiter: string;

    /**
     * The scores are rigged so the two possible endings name DIFFERENT
     * winners. If a Blitz lands, the high scorer (the forfeiter) wins. If the
     * forfeit lands, the forfeiter is gone and the last player standing wins.
     * Without that asymmetry a clobbered winner would look identical to a
     * correct one and the test would prove nothing.
     *
     * `targetScore: 5` keeps that asymmetry intact given a Blitz can end a ROUND
     * rather than the game: the high scorer makes 10, which clears 5, so a
     * landed Blitz finishes the game and crowns them. At the default target of
     * 100 this Blitz would leave the game `round_over` and the race being tested
     * - two ways of ENDING a game colliding - would not happen at all.
     */
    beforeEach(async () => {
      const userA = await prisma.user.create({
        data: { username: `blitz-${uuidv4()}`, password: TEST_TAG },
      });
      const userB = await prisma.user.create({
        data: { username: `forfeit-${uuidv4()}`, password: TEST_TAG },
      });

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 2,
          status: "playing",
          targetScore: 5,
          hostId: userA.id,
          gameState: { bankPiles: [] },
        },
      });
      raceGameId = game.id;

      const deckA = buildDeck().deck;
      deckA.blurtzPile.cards = [];
      const deckB = buildDeck().deck;

      // score = bankPileCount - 2 * blurtzRemaining
      // A:  1 - 2*0  =  1
      // B: 30 - 2*10 = 10  <- Blitz winner
      const rowA = await prisma.player.create({
        data: {
          userId: userA.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(deckA)),
          bankPileCount: 1,
        },
      });
      const rowB = await prisma.player.create({
        data: {
          userId: userB.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(deckB)),
          bankPileCount: 30,
        },
      });

      blitzCaller = rowA.id;
      forfeiter = rowB.id;
    });

    /** Genuinely concurrent. Sequentially this race cannot happen at all. */
    function race() {
      return Promise.allSettled([
        service.callBlitz(raceGameId, blitzCaller),
        service.forfeitGame(raceGameId, forfeiter),
      ]);
    }

    it("ends the game exactly once - whoever commits second bails", async () => {
      const results = await race();

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Unlocked, BOTH of these complete: the forfeit's stale read still says
      // "playing", so it never notices the game has already ended.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The loser must bail on the status it observed under the lock, not
      // die on a constraint or a missing row.
      const loss = rejected[0] as PromiseRejectedResult;
      expect(loss.reason).toBeInstanceOf(BadRequestException);
      expect(loss.reason.message).toMatch(/not in progress|Game is not in progress/);
    });

    it("leaves a database that agrees with whichever mutation committed", async () => {
      const [blitz] = await race();

      const game = await prisma.game.findUnique({
        where: { id: raceGameId },
        include: { players: true },
      });
      const playerIds = game.players.map((p) => p.id).sort();

      expect(game.status).toBe("finished");

      if (blitz.status === "fulfilled") {
        // The Blitz committed first. It crowned the high scorer - who is the
        // player that tried to forfeit - and the forfeit bailed, so their row
        // is untouched and both scores are the Blitz's.
        expect(game.winnerPlayerId).toBe(forfeiter);
        expect(playerIds).toEqual([blitzCaller, forfeiter].sort());
        expect(game.players.find((p) => p.id === blitzCaller).score).toBe(1);
        expect(game.players.find((p) => p.id === forfeiter).score).toBe(10);
      } else {
        // The forfeit committed first: the forfeiter is gone and the last
        // player standing takes it. The Blitz bailed, so it never scored.
        expect(game.winnerPlayerId).toBe(blitzCaller);
        expect(playerIds).toEqual([blitzCaller]);
        expect(game.players.find((p) => p.id === blitzCaller).score).toBe(0);
      }

      // Spelled out because it is the defect: an unlocked forfeit produces a
      // hybrid neither branch above accepts - the Blitz's scores on the board,
      // but the forfeit's winner sitting on the game row.
      const blitzScored = game.players.some((p) => p.score !== 0);
      expect(blitzScored).toBe(blitz.status === "fulfilled");
    });
  });

  // joinGame is check-then-create, so without the lock concurrent joins can seat
  // the same user twice.
  describe("concurrent joins by the same user", () => {
    it("creates exactly one player row", async () => {
      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 4,
          status: "waiting",
          hostId: "nobody",
          gameState: { bankPiles: [] },
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
  // A double Blitz is survivable only if a Blitz always ENDS the game - the
  // second caller writes the same terminal state over the first. With rounds it
  // is not: two callers each accumulate into `score`, each write a RoundResult,
  // and each bump the round. Double-counted, and permanent.
  describe("two players calling Blitz at the same instant", () => {
    let raceGameId: string;
    let callerOne: string;
    let callerTwo: string;
    let userIds: string[];

    /**
     * BOTH players have an empty blurtz pile, so both are legally entitled to
     * call it. That is what makes this a real race rather than one valid call
     * and one rejection: nothing about either caller is wrong, and only the
     * lock decides which one lands.
     */
    beforeEach(async () => {
      const userA = await prisma.user.create({
        data: { username: `race-blitz-a-${uuidv4()}`, password: TEST_TAG },
      });
      const userB = await prisma.user.create({
        data: { username: `race-blitz-b-${uuidv4()}`, password: TEST_TAG },
      });
      userIds = [userA.id, userB.id];

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 2,
          status: "playing",
          // High enough that neither player can finish the game: this Blitz
          // must land on `round_over`, which is the state a double call
          // corrupts.
          targetScore: 100,
          currentRound: 1,
          hostId: userA.id,
          gameState: { bankPiles: [] },
        },
      });
      raceGameId = game.id;

      const deckA = buildDeck().deck;
      deckA.blurtzPile.cards = [];
      const deckB = buildDeck().deck;
      deckB.blurtzPile.cards = [];

      const rowA = await prisma.player.create({
        data: {
          userId: userA.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(deckA)),
          bankPileCount: 6,
          // Carried in from earlier rounds - the number a double Blitz would
          // accumulate into twice.
          score: 10,
        },
      });
      const rowB = await prisma.player.create({
        data: {
          userId: userB.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(deckB)),
          bankPileCount: 3,
          score: 4,
        },
      });

      callerOne = rowA.id;
      callerTwo = rowB.id;
    });

    /** Genuinely concurrent. Run sequentially this proves nothing. */
    function race() {
      return Promise.allSettled([
        service.callBlitz(raceGameId, callerOne),
        service.callBlitz(raceGameId, callerTwo),
      ]);
    }

    it("lets exactly ONE Blitz land, and the loser bails on the status", async () => {
      const results = await race();

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Unlocked, BOTH complete: each reads `playing` before either writes.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The loser must fail on the status it read under the lock - not on a
      // unique-constraint violation, and not on a missing row.
      const loss = rejected[0] as PromiseRejectedResult;
      expect(loss.reason).toBeInstanceOf(BadRequestException);
      expect(loss.reason.message).toMatch(/not in progress/);
    });

    it("advances the round exactly once and scores it exactly once", async () => {
      await race();

      const game = await prisma.game.findUnique({
        where: { id: raceGameId },
        include: { players: { orderBy: { id: "asc" } } },
      });

      // The round ended; nobody reached 100.
      expect(game.status).toBe("round_over");
      // Still round 1: the round is OVER, not advanced - the advance waits on
      // the players readying up. What matters is that the loser did not bump it.
      expect(game.currentRound).toBe(1);
      expect(game.winnerPlayerId).toBeNull();

      // Scored once, from the carried-in totals:
      //   A: 10 + (6 - 2*0) = 16
      //   B:  4 + (3 - 2*0) =  7
      // A second scoring pass would make these 22 and 10.
      const a = game.players.find((p) => p.id === callerOne);
      const b = game.players.find((p) => p.id === callerTwo);
      expect(a.score).toBe(16);
      expect(b.score).toBe(7);
      expect(a.roundScore).toBe(6);
      expect(b.roundScore).toBe(3);
    });

    it("writes exactly one RoundResult per player for the round", async () => {
      await race();

      const rows = await prisma.roundResult.findMany({
        where: { gameId: raceGameId, round: 1 },
        orderBy: { playerId: "asc" },
      });

      // One per player, not two. The (gameId, playerId, round) unique index is
      // the backstop here, but the lock is what should mean it never fires.
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.playerId === callerOne)).toHaveLength(1);
      expect(rows.filter((r) => r.playerId === callerTwo)).toHaveLength(1);

      // Exactly one of them is the caller who won the race.
      expect(rows.filter((r) => r.calledBlurtz)).toHaveLength(1);
    });

    it("credits nobody's gamesPlayed for a round that ended without finishing", async () => {
      await race();

      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
      });

      // The game is `round_over`, not `finished`. Neither the winner nor the
      // loser of the race may have credited a game here.
      expect(users.every((u) => u.gamesPlayed === 0)).toBe(true);
      expect(users.every((u) => u.gamesWon === 0)).toBe(true);
    });
  });

  // A round played end to end, against the real database.
  describe("playing a round to a Blitz with a low target", () => {
    let gameOneId: string;
    let hostUserId: string;
    let otherUserId: string;
    let hostPlayerId: string;
    let otherPlayerId: string;

    async function seedGame(targetScore: number) {
      const host = await prisma.user.create({
        data: { username: `round-host-${uuidv4()}`, password: TEST_TAG },
      });
      const other = await prisma.user.create({
        data: { username: `round-other-${uuidv4()}`, password: TEST_TAG },
      });
      hostUserId = host.id;
      otherUserId = other.id;

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 2,
          status: "playing",
          targetScore,
          currentRound: 1,
          hostId: host.id,
          gameState: { bankPiles: [] },
        },
      });
      gameOneId = game.id;

      // The host is the one who empties their blurtz pile and calls it.
      const hostDeck = buildDeck().deck;
      hostDeck.blurtzPile.cards = [];
      const otherDeck = buildDeck().deck;

      const hostRow = await prisma.player.create({
        data: {
          userId: host.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(hostDeck)),
          bankPileCount: 3,
          isReady: false,
        },
      });
      const otherRow = await prisma.player.create({
        data: {
          userId: other.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(otherDeck)),
          bankPileCount: 1,
          isReady: false,
        },
      });
      hostPlayerId = hostRow.id;
      otherPlayerId = otherRow.id;
    }

    it("ends the round, accumulates score, resets counters and re-deals 40 cards", async () => {
      // Target 5: one round of 3 is not enough, two are.
      await seedGame(5);

      // --- Round 1 -----------------------------------------------------
      const blitz = await service.callBlitz(gameOneId, hostPlayerId);
      expect(blitz.status).toBe("round_over");

      let game = await prisma.game.findUnique({
        where: { id: gameOneId },
        include: { players: true },
      });
      expect(game.status).toBe("round_over");
      expect(game.currentRound).toBe(1);

      let host = game.players.find((p) => p.id === hostPlayerId);
      // 3 banked, nothing stranded.
      expect(host.score).toBe(3);
      expect(host.roundScore).toBe(3);
      // Not yet reset - the advance is what resets it.
      expect(host.bankPileCount).toBe(3);

      // The other player was caught with a full blurtz pile: 1 - 2*10 = -19.
      const other = game.players.find((p) => p.id === otherPlayerId);
      expect(other.score).toBe(-19);

      // Nobody has finished a game, so nobody has played one yet.
      let users = await prisma.user.findMany({
        where: { id: { in: [hostUserId, otherUserId] } },
      });
      expect(users.every((u) => u.gamesPlayed === 0)).toBe(true);

      // --- Ready up, and the last ready-up advances --------------------
      // One player readying up is not enough: the round holds until the whole
      // table is ready.
      await service.setPlayerReady(gameOneId, hostPlayerId, true);
      const midway = await prisma.game.findUnique({ where: { id: gameOneId } });
      expect(midway.status).toBe("round_over");
      expect(midway.currentRound).toBe(1);

      // The second (last) ready-up deals round 2 itself - no host action.
      await service.setPlayerReady(gameOneId, otherPlayerId, true);

      game = await prisma.game.findUnique({
        where: { id: gameOneId },
        include: { players: true },
      });

      expect(game.status).toBe("playing");
      expect(game.currentRound).toBe(2);

      for (const player of game.players) {
        const deck = player.deck as unknown as PlayerDeck;
        // A whole fresh deck each.
        expect(countDeckCards(deck)).toBe(CARDS_PER_PLAYER);
        expect(deck.blurtzPile.cards).toHaveLength(10);
        // The per-round counters are back to zero...
        expect(player.bankPileCount).toBe(0);
        expect(player.roundScore).toBe(0);
        expect(player.isReady).toBe(false);
      }

      // ...but the cumulative score is NOT. This is the whole point.
      host = game.players.find((p) => p.id === hostPlayerId);
      expect(host.score).toBe(3);

      // --- Round 2, to the target -------------------------------------
      // Bank enough to cross 5, and empty the blurtz pile so the call is legal.
      const hostDeck = game.players.find((p) => p.id === hostPlayerId)
        .deck as unknown as PlayerDeck;
      hostDeck.blurtzPile.cards = [];
      await prisma.player.update({
        where: { id: hostPlayerId },
        data: {
          deck: JSON.parse(JSON.stringify(hostDeck)),
          bankPileCount: 4,
        },
      });

      const final = await service.callBlitz(gameOneId, hostPlayerId);

      // 3 carried + 4 = 7 >= 5.
      expect(final.status).toBe("finished");
      expect(final.winnerId).toBe(hostPlayerId);
      expect(final.scores[hostPlayerId]).toBe(7);

      game = await prisma.game.findUnique({
        where: { id: gameOneId },
        include: { players: true },
      });
      expect(game.status).toBe("finished");
      expect(game.winnerPlayerId).toBe(hostPlayerId);

      // A RoundResult per player per round: 2 rounds x 2 players.
      const rows = await prisma.roundResult.findMany({
        where: { gameId: gameOneId },
      });
      expect(rows).toHaveLength(4);

      // --- And the stats ------------------------------------------------
      users = await prisma.user.findMany({
        where: { id: { in: [hostUserId, otherUserId] } },
      });
      const hostUser = users.find((u) => u.id === hostUserId);
      const otherUser = users.find((u) => u.id === otherUserId);

      // Credited exactly once, by the game that finished.
      expect(hostUser.gamesPlayed).toBe(1);
      expect(hostUser.gamesWon).toBe(1);
      expect(otherUser.gamesPlayed).toBe(1);
      expect(otherUser.gamesWon).toBe(0);
    });
  });

  // `round_over` round-trips through a real database, where the FK behaviour and
  // the row locks are the point.

  /** A user tagged for cleanup. */
  async function makeUser(prefix: string) {
    return prisma.user.create({
      data: { username: `${prefix}-${uuidv4()}`, password: TEST_TAG },
    });
  }

  describe("a game whose round is over", () => {
    let userOneId: string;
    let userTwoId: string;
    let quitterPlayerId: string;
    let stayerPlayerId: string;
    let roundOverGameId: string;

    /** Two players sat in the round_over interstitial, scores on the board. */
    async function seedRoundOver() {
      const quitter = await makeUser("ro-quitter");
      const stayer = await makeUser("ro-stayer");
      userOneId = quitter.id;
      userTwoId = stayer.id;

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 2,
          status: "round_over",
          targetScore: 100,
          currentRound: 1,
          hostId: quitter.id,
          gameState: { bankPiles: [] },
        },
      });
      roundOverGameId = game.id;

      const rowOne = await prisma.player.create({
        data: {
          userId: quitter.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(buildDeck().deck)),
          score: 12,
          isReady: false,
        },
      });
      const rowTwo = await prisma.player.create({
        data: {
          userId: stayer.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(buildDeck().deck)),
          score: 8,
          isReady: false,
        },
      });
      quitterPlayerId = rowOne.id;
      stayerPlayerId = rowTwo.id;
    }

    beforeEach(seedRoundOver);

    // Drop `round_over` from getActiveGames' filter and a player who opens the
    // Dashboard during the interstitial sees NOTHING - the game they are in the
    // middle of is not listed, and there is no way back into it.
    it("is listed as an active game for the players in it", async () => {
      const active = await service.getActiveGames(userTwoId);

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(roundOverGameId);
      expect(active[0].status).toBe("round_over");
    });

    // The strand: delete the Player row through the waiting-lobby path and a
    // round_over game is left with one player. joinGame refuses a non-waiting
    // game, so they cannot come back; the round advance cannot fire below
    // MIN_PLAYERS. Stuck, unwinnable, forever.
    it("finishes rather than stranding when a player leaves a two-player game", async () => {
      await service.leaveGame(roundOverGameId, userOneId);

      const game = await prisma.game.findUnique({
        where: { id: roundOverGameId },
        include: { players: true },
      });

      expect(game.status).toBe("finished");
      // The last player standing won it.
      expect(game.winnerPlayerId).toBe(stayerPlayerId);
      expect(game.players.map((p) => p.id)).toEqual([stayerPlayerId]);

      // A game that was really played, credited like one.
      const users = await prisma.user.findMany({
        where: { id: { in: [userOneId, userTwoId] } },
      });
      const stayerUser = users.find((u) => u.id === userTwoId);
      const quitterUser = users.find((u) => u.id === userOneId);
      expect(stayerUser.gamesPlayed).toBe(1);
      expect(stayerUser.gamesWon).toBe(1);
      expect(quitterUser.gamesPlayed).toBe(1);
      expect(quitterUser.gamesWon).toBe(0);
    });

    // The stale-readiness half of the skip: without the lock and the status
    // guard, a ready write lands AFTER the deal that reset it - pre-readying
    // that player for the NEXT interstitial.
    it("cannot be readied up again once the next round has been dealt", async () => {
      // One player ready already; the OTHER player's ready-up is the last one,
      // so it deals the next round itself.
      await prisma.player.update({
        where: { id: stayerPlayerId },
        data: { isReady: true },
      });

      await service.setPlayerReady(roundOverGameId, quitterPlayerId, true);

      const dealt = await prisma.game.findUnique({
        where: { id: roundOverGameId },
      });
      expect(dealt.status).toBe("playing");

      await expect(
        service.setPlayerReady(roundOverGameId, quitterPlayerId, true)
      ).rejects.toThrow(BadRequestException);

      const players = await prisma.player.findMany({
        where: { gameId: roundOverGameId },
      });
      // The deal cleared readiness and nothing may put it back while the
      // round is being played.
      expect(players.every((p) => p.isReady === false)).toBe(true);
    });

    // The double-deal guard. The deal lives inside `setPlayerReady`, so two
    // players firing the FINAL ready-up at the same instant is the race that
    // matters. Unlocked, both read "one ready, one not", both write the last
    // ready, and both advance - currentRound jumps by two and every deck is
    // dealt twice. Under the game-row lock the first advances to `playing` and
    // the second blocks, then reads `playing` at the status guard and bails.
    it("deals the next round exactly once when two final ready-ups race", async () => {
      // The stayer is already ready; both racers try to be the quitter's last
      // ready-up.
      await prisma.player.update({
        where: { id: stayerPlayerId },
        data: { isReady: true },
      });

      const results = await Promise.allSettled([
        service.setPlayerReady(roundOverGameId, quitterPlayerId, true),
        service.setPlayerReady(roundOverGameId, quitterPlayerId, true),
      ]);

      // Exactly one completes; the other bails on the status it read under the
      // lock, having advanced nothing.
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        BadRequestException
      );

      const game = await prisma.game.findUnique({
        where: { id: roundOverGameId },
        include: { players: { orderBy: { id: "asc" } } },
      });

      // Advanced by EXACTLY one: round 1 -> 2. Double-dealt, this is 3.
      expect(game.status).toBe("playing");
      expect(game.currentRound).toBe(2);
      expect(game.players.every((p) => p.isReady === false)).toBe(true);

      // Every player holds one whole freshly-dealt deck - not a deck dealt
      // twice, and not a torn half-deal.
      for (const player of game.players) {
        const deck = player.deck as unknown as PlayerDeck;
        expect(countDeckCards(deck)).toBe(CARDS_PER_PLAYER);
        expect(deck.blurtzPile.cards).toHaveLength(10);
      }
    });
  });

  // A finished game is a record, and `Game.winnerPlayerId` is ON DELETE SET
  // NULL - so deleting the Player row it names does not fail, it silently
  // erases who won.
  describe("a finished game", () => {
    it("does not let a participant delete the row its winner points at", async () => {
      const winner = await makeUser("done-winner");
      const loser = await makeUser("done-loser");

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 2,
          status: "finished",
          hostId: winner.id,
          gameState: { bankPiles: [] },
        },
      });

      const winnerRow = await prisma.player.create({
        data: { userId: winner.id, gameId: game.id, deck: null, score: 100 },
      });
      await prisma.player.create({
        data: { userId: loser.id, gameId: game.id, deck: null, score: 3 },
      });
      await prisma.game.update({
        where: { id: game.id },
        data: { winnerPlayerId: winnerRow.id },
      });

      // Leaving is allowed - it is how a player gets out of the final
      // scoreboard - it just must not take the record with it.
      const state = await service.leaveGame(game.id, winner.id);
      expect(state.winner).toBe(winnerRow.id);

      const after = await prisma.game.findUnique({
        where: { id: game.id },
        include: { players: true },
      });

      // Delete this player and the FK nulls the winner: the game forgets it was
      // won at all, and the host is handed to the loser on the way past.
      expect(after.winnerPlayerId).toBe(winnerRow.id);
      expect(after.players).toHaveLength(2);
      expect(after.status).toBe("finished");
      expect(after.hostId).toBe(winner.id);
    });
  });

  // A forfeit the game SURVIVES must still leave `hostId` naming a live player,
  // and the round must advance regardless of who the host is.
  describe("the host forfeiting a three-player game", () => {
    it("reassigns the host to a live player, and the round still advances", async () => {
      const host = await makeUser("ff-host");
      const second = await makeUser("ff-second");
      const third = await makeUser("ff-third");

      const game = await prisma.game.create({
        data: {
          name: TEST_TAG,
          alias: uuidv4().slice(0, 8).toUpperCase(),
          maxPlayers: 4,
          status: "playing",
          // High enough that the Blitz below ends the ROUND, not the game.
          targetScore: 100,
          currentRound: 1,
          hostId: host.id,
          gameState: { bankPiles: [] },
        },
      });

      const hostRow = await prisma.player.create({
        data: {
          userId: host.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(buildDeck().deck)),
        },
      });
      // This one empties their blurtz pile, so they can call the round.
      const blitzDeck = buildDeck().deck;
      blitzDeck.blurtzPile.cards = [];
      const secondRow = await prisma.player.create({
        data: {
          userId: second.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(blitzDeck)),
          bankPileCount: 4,
        },
      });
      const thirdRow = await prisma.player.create({
        data: {
          userId: third.id,
          gameId: game.id,
          deck: JSON.parse(JSON.stringify(buildDeck().deck)),
        },
      });

      // The host walks out. Two players remain, so the game plays on.
      await service.forfeitGame(game.id, hostRow.id);

      let after = await prisma.game.findUnique({
        where: { id: game.id },
        include: { players: true },
      });
      expect(after.status).toBe("playing");
      expect(after.players).toHaveLength(2);

      // The invariant: the host is someone still IN the game. (Which of the two
      // inherits it is Postgres' row order, not a contract.)
      const remainingUserIds = after.players.map((p) => p.userId);
      expect(remainingUserIds).toContain(after.hostId);

      // Play on to the interstitial, where a missing host would be fatal.
      const blitz = await service.callBlitz(game.id, secondRow.id);
      expect(blitz.status).toBe("round_over");

      await service.setPlayerReady(game.id, secondRow.id, true);
      const midway = await prisma.game.findUnique({ where: { id: game.id } });
      expect(midway.status).toBe("round_over");

      // The last ready-up deals round 2, and crucially needs no host - which is
      // the whole point now that the host forfeited. A host-triggered advance
      // would want a host who is no longer a player, so its check could not be
      // satisfied by anyone alive.
      await service.setPlayerReady(game.id, thirdRow.id, true);

      after = await prisma.game.findUnique({
        where: { id: game.id },
        include: { players: true },
      });
      expect(after.status).toBe("playing");
      expect(after.currentRound).toBe(2);
    });
  });
});
