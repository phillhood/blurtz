import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@prisma";
import { PlayerDeckSchema } from "@schemas";
import { UserService } from "@user/user.service";
import { generateAlias, generateAliasWithNumber } from "@utils";
import { DbClient, GameRepository } from "./game.repository";
// The rules engine, its constants and the domain types: one package, resolved
// through the workspace symlink. No path alias - see shared/src/index.ts.
import {
  createBankPiles,
  dealCards,
  executeMove,
  // Aliased: this service has a `flipDrawPile` method of its own, which is the
  // database-facing wrapper around this pure function.
  flipDrawPile as flipDrawPileCards,
  initializeGameState,
  scoreRound,
  validateMove,
  GAME_CONSTANTS,
  GameListing,
  GameState,
  MoveResult,
  Pile,
  PlayerDeck,
} from "@blurtz/shared";

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private prisma: PrismaService,
    private gameRepository: GameRepository,
    private userService: UserService
  ) {}

  /**
   * Refuse to deal unless the table is ready.
   *
   * The throwing gate on `startGame` (deal round 1 of a `waiting` game): being
   * the host is not enough, every player must have readied up. `setPlayerReady`
   * asks the SAME question between rounds, but as a boolean rather than a
   * throw - a not-yet-ready table there is the normal case, not an error, so it
   * waits and auto-advances only once this condition holds. `isReady` had no
   * server-side meaning at all before this - it was a lobby decoration the
   * client drew and nothing enforced.
   */
  private assertReadyToDeal(
    players: Array<{ isReady: boolean }>,
    action: string
  ): void {
    if (players.length < GAME_CONSTANTS.MIN_PLAYERS) {
      throw new BadRequestException(`Not enough players to ${action}`);
    }

    if (!players.every((p) => p.isReady)) {
      throw new BadRequestException(`All players must be ready to ${action}`);
    }
  }

  /**
   * Deal every player a fresh 40-card deck.
   *
   * `reset` is merged into the same write, so a round advance is one update
   * per player rather than two. What it carries is the per-round counters -
   * and what it must NEVER carry is `score`, which is cumulative and is the
   * only thing `targetScore` is measured against.
   */
  private async dealDecks(
    tx: DbClient,
    players: Array<{ id: string }>,
    reset: Record<string, unknown> = {}
  ): Promise<void> {
    for (const player of players) {
      const deck = dealCards(players.length);
      await tx.player.update({
        where: { id: player.id },
        data: { deck: JSON.parse(JSON.stringify(deck)), ...reset },
      });
    }
  }

  /**
   * Guard the JSON→domain boundary for a deck read out of the database.
   *
   * `Player.deck` is an opaque JSON blob; nothing at the type level stops it
   * from being half-written, hand-edited, or left behind by an older shape.
   * A corrupt deck must fail loudly here rather than be silently half-played
   * into a game - a `cards: undefined` slipping through turns one bad row
   * into a cascade of wrong moves.
   *
   * The validated original is returned, not Zod's parsed clone: these are the
   * domain types in `@types`, and the schema's job is to police the boundary,
   * not to redefine them.
   */
  private parseDeck(playerId: string, deck: unknown): PlayerDeck {
    const result = PlayerDeckSchema.safeParse(deck);

    if (!result.success) {
      this.logger.error(
        `Corrupt deck for player ${playerId}: ${result.error.message}`
      );
      throw new InternalServerErrorException(
        `Stored deck for player ${playerId} is not a valid deck`
      );
    }

    return deck as unknown as PlayerDeck;
  }

  async generateUniqueAlias(maxAttempts: number = 5): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const alias = generateAlias();
      const existingGame = await this.prisma.game.findUnique({
        where: { alias },
        select: { id: true },
      });

      if (!existingGame) {
        return alias;
      }
    }

    const fallbackAlias = generateAliasWithNumber();
    const existingGame = await this.prisma.game.findUnique({
      where: { alias: fallbackAlias },
      select: { id: true },
    });
    if (!existingGame) {
      return fallbackAlias;
    } else {
      throw new BadRequestException("Could not generate a unique game alias");
    }
  }

  /**
   * Find a game by its invite code.
   *
   * The player fields are listed explicitly to leave `deck` OUT, and that is
   * load-bearing rather than tidiness. `deck` is a scalar, so an
   * `include: { players: ... }` selects it like any other column - and this
   * game goes straight back to the caller as the `joinByCode` response body.
   * A player rejoining a game already in progress by its code was handed every
   * opponent's face-down cards, the same leak the gateway redacts against and
   * reached without a socket. The only caller needs `id`.
   */
  async findGameByAlias(alias: string) {
    return this.prisma.game.findUnique({
      where: { alias },
      select: {
        id: true,
        name: true,
        alias: true,
        maxPlayers: true,
        isPrivate: true,
        status: true,
        hostId: true,
        winnerPlayerId: true,
        currentRound: true,
        targetScore: true,
        createdAt: true,
        updatedAt: true,
        players: {
          select: {
            id: true,
            userId: true,
            isReady: true,
            score: true,
            roundScore: true,
            bankPileCount: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });
  }

  async getAvailableGames(): Promise<GameListing[]> {
    const games = await this.prisma.game.findMany({
      where: { status: "waiting", isPrivate: false },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    return games.map((game) => ({
      id: game.id,
      name: game.name,
      alias: game.alias,
      maxPlayers: game.maxPlayers,
      currentPlayers: game.players.length,
      status: game.status,
      createdAt: game.createdAt,
    }));
  }

  async getActiveGames(userId: string): Promise<GameListing[]> {
    const playerGames = await this.prisma.player.findMany({
      where: { userId },
      select: { gameId: true },
    });

    const gameIds = playerGames.map((p) => p.gameId);

    if (gameIds.length === 0) {
      return [];
    }

    // Every status except `finished` - a game you are in and that is not over
    // is a game you can get back to.
    //
    // `round_over` was missing here and nowhere else: it is a status Phase 6
    // added, and this filter was written before it existed. A player who
    // opened the Dashboard during the round-over interstitial got an empty
    // list and no way back into a game they were in the middle of - and it
    // compounded, because the round cannot advance until they ready up.
    const games = await this.prisma.game.findMany({
      where: {
        status: { in: ["waiting", "starting", "playing", "round_over", "paused"] },
        id: { in: gameIds },
      },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    return games.map((game) => ({
      id: game.id,
      name: game.name,
      alias: game.alias,
      maxPlayers: game.maxPlayers,
      currentPlayers: game.players.length,
      status: game.status,
      createdAt: game.createdAt,
    }));
  }

  // Game init

  async createGame(
    name: string,
    userId: string,
    maxPlayers: number = 2,
    isPrivate: boolean = false
  ) {
    const alias = await this.generateUniqueAlias();
    const savedGame = await this.prisma.game.create({
      data: {
        name,
        alias,
        maxPlayers,
        isPrivate,
        status: "waiting",
        hostId: userId,
        gameState: initializeGameState() as unknown as object,
      },
    });

    this.logger.log(`Game created: ${savedGame.id} (${alias}) by user ${userId}`);

    // The host is always allowed into their own game, private or not.
    await this.joinGame(savedGame.id, userId, { allowPrivate: true });

    return savedGame;
  }

  /**
   * Add a user to a game.
   *
   * `allowPrivate` gates joining a game marked private. Knowing a private
   * game's id is not permission to enter it - only its invite code is, so
   * only the join-by-code path passes true. Players already in the game are
   * always let back in, so this cannot lock anyone out of a rejoin.
   *
   * Runs under the game lock: the membership check and the seat it claims are
   * check-then-create, so without it two joins racing the last seat both see
   * room and both take it.
   */
  async joinGame(
    gameId: string,
    userId: string,
    options: { allowPrivate?: boolean } = {}
  ) {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            select: { id: true, userId: true },
          },
        },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      const existingPlayer = game.players.find((p) => p.userId === userId);
      if (existingPlayer) {
        return game;
      }

      if (game.status !== "waiting") {
        throw new BadRequestException("Game is not accepting new players");
      }

      if (game.isPrivate && !options.allowPrivate) {
        throw new ForbiddenException(
          "This game is private - join it with its invite code"
        );
      }

      if (game.players.length >= game.maxPlayers) {
        throw new BadRequestException("Game is full");
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
      if (!user) {
        throw new NotFoundException("User not found");
      }

      await tx.player.create({
        data: {
          userId,
          gameId,
          deck: null,
          isReady: false,
          score: 0,
        },
      });

      this.logger.log(`Player ${userId} joined game ${gameId}`);
      return game;
    });
  }

  /**
   * Resolve the Player row id for a (game, user) pair.
   *
   * This is the single place that answers "is this user actually a player in
   * this game, and if so which player are they?". The socket gateway relies on
   * it to derive identity from the authenticated connection instead of
   * trusting a playerId sent over the wire.
   *
   * Returns null when the user is not a player in the game.
   */
  async getPlayerIdForUser(
    gameId: string,
    userId: string
  ): Promise<string | null> {
    const player = await this.prisma.player.findFirst({
      where: { gameId, userId },
      select: { id: true },
    });

    return player?.id ?? null;
  }

  /**
   * Hand the host role on, if the player leaving was holding it.
   *
   * `hostId` is a USER id and outlives the Player row it names, so every door
   * out of a game has to answer this question - and they were not answering it
   * the same way. `startGame` demands host AND membership, so a `hostId`
   * pointing at someone who has left is a lobby nobody can start: the host is
   * not in it, and everyone who is in it is not the host. The departed host
   * could still start it over REST, too. (Round advance no longer needs the
   * host - the last ready-up deals it - but a game's host should still be
   * someone who is actually in it.)
   *
   * ONE copy, TWO callers: the waiting-lobby path, which has always done this,
   * and `applyForfeit`, which never did (that was the bug). Extracted rather
   * than copied precisely because a second copy is how the two drifted apart
   * in the first place.
   *
   * No-ops when the leaver was not the host, or when nobody is left to take
   * it - a game with no players is being finished by its caller anyway.
   */
  private async reassignHostIfDeparting(
    tx: DbClient,
    game: { id: string; hostId: string },
    departingUserId: string,
    remainingPlayers: Array<{ userId: string }>
  ): Promise<void> {
    if (game.hostId !== departingUserId || remainingPlayers.length === 0) {
      return;
    }

    const heir = remainingPlayers[0].userId;
    await tx.game.update({
      where: { id: game.id },
      data: { hostId: heir },
    });
    this.logger.log(
      `Host ${departingUserId} left game ${game.id} - reassigned host to ${heir}`
    );
  }

  /**
   * Leave a game. What that MEANS depends entirely on the game's status:
   *
   *   waiting    -> walk out of a lobby: delete the Player row, hand on the
   *                 host, finish the game if the room is now empty. Nothing is
   *                 credited - nobody played anything.
   *   playing    -> forfeit it.
   *   round_over -> forfeit it. The interstitial is part of the game.
   *   finished   -> no-op. It is a record; there is nothing left to leave.
   *
   * That list is the fix. This method used to ask one question - "is it
   * playing?" - and treat every other status as a waiting lobby, which is
   * right for exactly one of the three and silently destructive for the other
   * two.
   *
   * Runs under the game lock: every branch above either ends a game or mutates
   * its membership, so they serialize on the same row as everything else.
   */
  async leaveGame(gameId: string, userId: string): Promise<GameState> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: {
              user: {
                select: { id: true, username: true },
              },
            },
          },
        },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      const player = game.players.find((p) => p.user.id === userId);
      if (!player) {
        throw new NotFoundException("Player not found in this game");
      }

      // Every branch below names the statuses it handles. This used to ask
      // only "is it playing?" and treat everything else as a waiting lobby,
      // which was wrong about both of the statuses that are neither:
      // `round_over` got a real game deleted out from under itself, and
      // `finished` got history rewritten.

      // A finished game is a RECORD. Deleting a Player row out of one is how a
      // game forgot who won it: `Game.winnerPlayerId` is ON DELETE SET NULL
      // (deliberately - see the schema), so the winner it named silently
      // became null, and the host reassignment below then handed the game to
      // the loser on its way past.
      //
      // A NO-OP, not a rejection, and the difference is the client. Leaving a
      // finished game is the normal way out of one: the final scoreboard
      // renders in the game view with the header's Leave button still on it,
      // and that button sends a plain leave for any status that is not
      // `playing`. Throwing here would put an error toast on the end of every
      // completed game AND strand the socket in the room - the gateway only
      // reaches `client.leave(gameId)` if this returns. So: nothing to delete,
      // nothing to reassign, hand back the state and let them go.
      if (game.status === "finished") {
        this.logger.log(
          `Player ${userId} left finished game ${gameId} - record preserved`
        );
        return this.readGameState(tx, gameId);
      }

      // An in-progress game - being played, or sat in the round-over
      // interstitial - is left by forfeiting it. `applyForfeit` finishes it if
      // that drops it below MIN_PLAYERS (crowning whoever is left and
      // crediting the game to everyone who played it) and otherwise keeps it
      // viable with a host who is still in it.
      //
      // The game was read under the lock, so hand it straight over rather than
      // re-reading it.
      if (game.status === "playing" || game.status === "round_over") {
        this.logger.log(
          `Player ${userId} leaving active game ${gameId} (${game.status}) - treating as forfeit`
        );
        return this.applyForfeit(tx, game, player.id);
      }

      // `starting` and `paused` exist in the GameStatus enum and nothing has
      // ever written either of them. Refuse rather than guess: the lobby path
      // below would delete a player out of a `paused` game exactly the way it
      // used to out of a `round_over` one, and that is the bug this method
      // just stopped having. If either status is ever made real, this is the
      // line that will say so.
      if (game.status !== "waiting") {
        throw new BadRequestException(
          `Cannot leave a game with status ${game.status}`
        );
      }

      this.logger.log(`Player ${userId} left game ${gameId}`);

      // The lobby path: nobody has been dealt a card here.
      const remainingPlayers = game.players.filter((p) => p.id !== player.id);

      // If no players left in waiting game, mark as finished.
      //
      // No `recordGameResults` here, deliberately. This game was never played
      // - it is a lobby nobody turned up to, reaching `finished` because that
      // is the only terminal status there is. Crediting a gamesPlayed for it
      // would let anyone inflate their stats by creating and leaving games in
      // a loop. Stats are credited where a game is actually DECIDED: a Blitz
      // that reaches the target, or a forfeit out of a game in progress.
      if (remainingPlayers.length === 0) {
        await tx.game.update({
          where: { id: gameId },
          data: { status: "finished" },
        });
      } else {
        // The host may be the one leaving, but the lobby lives on.
        await this.reassignHostIfDeparting(tx, game, userId, remainingPlayers);
      }
      await tx.player.delete({ where: { id: player.id } });
      return this.readGameState(tx, gameId);
    });
  }

  /**
   * Runs under the game lock.
   *
   * A forfeit ends the game, and so does a Blitz - they must not both be
   * allowed to decide how. This used to read the game through the pooled
   * client, outside the lock: a forfeit racing a Blitz read the pre-Blitz
   * `playing` row, picked a winner from it in JS, then blocked on the row lock
   * for the Blitz to commit and wrote its stale winner straight over the top.
   * The game ended with the wrong winner and the Blitz's scores still on the
   * board.
   */
  async forfeitGame(gameId: string, playerId: string): Promise<GameState> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        // `userId` is selected because a forfeit that ends the game credits
        // every player's User row with it.
        include: { players: { select: { id: true, userId: true } } },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      return this.applyForfeit(tx, game, playerId);
    });
  }

  /**
   * The forfeit itself, on a game already read INSIDE `withGameLock`.
   *
   * `tx` is not optional and `game` must have come from that same `tx`. The
   * status check below is only a real guard because of that: it is what makes
   * a forfeit arriving behind a committed Blitz observe `finished` and bail
   * instead of clobbering it. Read the game anywhere else and the check is
   * just a stale value, which is precisely the bug this shape exists to stop.
   *
   * "In progress" means `playing` OR `round_over`. The interstitial is part of
   * the game: rounds have been played, score is on the board and RoundResults
   * are written - the only thing separating it from `playing` is that
   * everyone is looking at a scoreboard. Walking out of it abandons a game
   * that was really played, so it ends the same way walking out of `playing`
   * does. Refusing it was half of what stranded a two-player game with one
   * player, no winner and no way back in.
   *
   * `finished` is still refused, and that is the half the Blitz race needs: a
   * forfeit behind a Blitz that ENDED the game observes `finished` and bails.
   * A forfeit behind a Blitz that ended a ROUND now proceeds - correctly. It
   * finishes the round_over game the Blitz committed without touching the
   * scores that Blitz just wrote, which is not a clobber but the right answer
   * to "they left".
   */
  private async applyForfeit(
    tx: DbClient,
    game: {
      id: string;
      status: string;
      hostId: string;
      players: Array<{ id: string; userId: string }>;
    },
    playerId: string
  ): Promise<GameState> {
    if (game.status !== "playing" && game.status !== "round_over") {
      throw new BadRequestException("Cannot forfeit - game is not in progress");
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      throw new NotFoundException("Player not found in this game");
    }

    const remainingPlayers = game.players.filter((p) => p.id !== playerId);

    if (remainingPlayers.length === 1) {
      const winner = remainingPlayers[0];

      await tx.game.update({
        where: { id: game.id },
        data: {
          status: "finished",
          winnerPlayerId: winner.id,
        },
      });
      // A forfeit is a real finish: the winner won it and the forfeiter played
      // it. Both get a gamesPlayed. Fired here rather than in `forfeitGame` so
      // it covers the socket forfeit AND `leaveGame`'s forfeit path, which is
      // the same ending reached by a different door.
      await this.userService.recordGameResults(tx, [
        { userId: winner.userId, won: true },
        { userId: player.userId, won: false },
      ]);
      this.logger.log(`Player ${playerId} forfeited game ${game.id} - winner: ${winner.id}`);
    } else if (remainingPlayers.length === 0) {
      await tx.game.update({
        where: { id: game.id },
        data: {
          status: "finished",
          winnerPlayerId: null,
        },
      });
      // Nobody is left to win it, but the player who was here played it.
      await this.userService.recordGameResults(tx, [
        { userId: player.userId, won: false },
      ]);
      this.logger.log(`Player ${playerId} forfeited game ${game.id} - no remaining players`);
    } else {
      // More than one player left: the game plays on and nothing is credited.
      //
      // But its host should still be someone who is IN it. This used to be
      // load-bearing in a sharper way: the game ran on happily until its next
      // `round_over` and then died there, because the old host-triggered round
      // advance wanted the host and the host had forfeited - no remaining
      // player could deal, and the game could not be left either. The round now
      // advances automatically on the last ready-up, so a missing host no
      // longer strands it, but the host role must still name a live player.
      await this.reassignHostIfDeparting(
        tx,
        game,
        player.userId,
        remainingPlayers
      );
    }
    await tx.player.delete({ where: { id: player.id } });

    return this.readGameState(tx, game.id);
  }

  /**
   * Start a game.
   *
   * `userId` is a User id (matching `Game.hostId`, which `createGame` sets from
   * the creating user), NOT a Player id. Only the host may start, and only once
   * every player has readied up.
   *
   * Runs under the game lock: dealing writes every player's deck AND flips the
   * game to `playing`. Half of that landing - dealt decks in a game still
   * `waiting`, or a `playing` game with empty decks - is not a state the rules
   * have an answer for.
   */
  async startGame(gameId: string, userId: string): Promise<GameState> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: {
              user: {
                select: { id: true, username: true },
              },
            },
          },
        },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      if (game.status !== "waiting") {
        throw new BadRequestException("Game has already started");
      }

      if (game.hostId !== userId) {
        throw new ForbiddenException("Only the host can start the game");
      }

      // Being the host is not enough - you must still be IN the game. The
      // socket path checks membership before it gets here, but the REST route
      // calls this directly, and `hostId` outlives the host's Player row if
      // leaveGame ever failed to reassign it.
      if (!game.players.some((p) => p.userId === userId)) {
        throw new ForbiddenException("You are not a player in this game");
      }

      this.assertReadyToDeal(game.players, "start the game");

      // `isReady` is consumed by the deal, exactly as in the round advance
      // (`advanceRound`).
      //
      // It used to be left alone here, and that asymmetry skipped the
      // round-over gate exactly once: the `isReady: true` everyone set in the
      // LOBBY survived all of round 1 (nothing else clears it - `callBlitz`
      // does not), so the round-over interstitial appeared with its ready-up
      // gate already satisfied and round 2 dealt before either player had
      // looked at the scoreboard. Every round after that behaved, because
      // round 2 was dealt by the round advance and IT resets - which is what
      // made this so easy to miss.
      //
      // Only `isReady`: `bankPileCount` and `roundScore` are zero on a fresh
      // Player row, and `score` must never be reset by a deal.
      await this.dealDecks(tx, game.players, { isReady: false });

      await tx.game.update({
        where: { id: gameId },
        data: { status: "playing" },
      });

      this.logger.log(
        `Game ${gameId} started with ${game.players.length} players ` +
          `(round ${game.currentRound}, target ${game.targetScore})`
      );
      return this.readGameState(tx, gameId);
    });
  }

  /**
   * Deal the next round of a game whose round is over.
   *
   * The other half of the state machine `callBlitz` opened:
   *
   *   round_over --(the last player readies up)--> playing
   *
   * There is no host action between rounds any more: `setPlayerReady` calls
   * this the instant the final ready-up lands, in the SAME transaction. `game`
   * must therefore have been read inside `withGameLock` off the same `tx` -
   * like `applyForfeit`, that is what makes it safe. The deal, the counter
   * resets, the round bump and the board reset are one atomic change under the
   * game lock or they are a game nobody can play; and because they are
   * serialized on the game row with the ready write that triggered them, two
   * simultaneous final ready-ups cannot double-deal - the second blocks, then
   * reads `playing` at the status guard and never gets here.
   *
   * Deliberately not folded into `startGame`. The two share `dealDecks`, but
   * `startGame` only ever deals a `waiting` game and this only ever advances a
   * `round_over` one - a method that could do either would be one status check
   * away from re-dealing a game in progress, which is every player's hand gone
   * mid-race.
   */
  private async advanceRound(
    tx: DbClient,
    game: { id: string; currentRound: number; players: Array<{ id: string }> }
  ): Promise<void> {
    // Fresh decks, and the per-round counters zeroed in the same write.
    // `score` is NOT in this list and must never be: it is the running total
    // the game is played to.
    await this.dealDecks(tx, game.players, {
      bankPileCount: 0,
      roundScore: 0,
      isReady: false,
    });

    await tx.game.update({
      where: { id: game.id },
      data: {
        status: "playing",
        currentRound: { increment: 1 },
        // The shared board goes back to empty foundations. Bank piles are
        // per-round: last round's 1-10 runs are scored and gone.
        gameState: initializeGameState() as unknown as object,
      },
    });

    this.logger.log(`Game ${game.id} advanced to round ${game.currentRound + 1}`);
  }

  /**
   * Read the full game state through the pooled client.
   *
   * Callers already inside `withGameLock` must use `readGameState(tx, ...)`
   * instead - this one would read on another connection, outside their
   * transaction, and could not see their own uncommitted writes.
   */
  async getGameState(gameId: string): Promise<GameState> {
    return this.readGameState(this.prisma, gameId);
  }

  private async readGameState(
    client: DbClient,
    gameId: string
  ): Promise<GameState> {
    const game = await client.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException("Game not found");
    }

    const gameState = game.gameState as any;

    return {
      id: game.id,
      name: game.name,
      alias: game.alias,
      maxPlayers: game.maxPlayers,
      currentPlayers: game.players.length,
      hostId: game.hostId,
      players: game.players.map((p) => ({
        id: p.id,
        username: p.user.username,
        user: p.user as any,
        isReady: p.isReady,
        deck: p.deck as unknown as PlayerDeck,
        score: p.score,
        roundScore: p.roundScore,
        bankPileCount: p.bankPileCount,
      })),
      bankPiles: gameState?.bankPiles || createBankPiles(),
      status: game.status,
      // Both read straight off the row now. `currentRound` was hard-coded to 0
      // here, which is why no round ever appeared to advance no matter what
      // the rest of the code did.
      currentRound: game.currentRound,
      targetScore: game.targetScore,
      // Read directly rather than resolved through `players.find`. The column
      // is a real foreign key with ON DELETE SET NULL now, so a winner whose
      // Player row is gone is already null here - the lookup that used to
      // launder that case away has nothing left to do.
      winner: game.winnerPlayerId ?? null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    };
  }

  async flipDrawPile(gameId: string, playerId: string): Promise<PlayerDeck> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: { players: true },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      if (game.status !== "playing") {
        throw new BadRequestException("Game is not in progress");
      }

      const player = game.players.find((p) => p.id === playerId);
      if (!player) {
        throw new NotFoundException("Player not found");
      }

      const playerDeck = this.parseDeck(playerId, player.deck);
      playerDeck.drawPile.cards = flipDrawPileCards(playerDeck.drawPile.cards);

      await tx.player.update({
        where: { id: playerId },
        data: { deck: JSON.parse(JSON.stringify(playerDeck)) },
      });

      return playerDeck;
    });
  }

  /**
   * Ready up, or un-ready, in the lobby or between rounds.
   *
   * `isReady` is the gate on BOTH deals, so a write to it is a write to the
   * only thing standing between a player and a fresh hand. It gets the same
   * lock and the same status check as every other mutator, and it needs both
   * halves:
   *
   * - The GUARD, because nothing clears readiness during play - `callBlitz`
   *   does not. A `true` set while the game was `playing` survived into the
   *   round_over interstitial and pre-satisfied its gate before anyone had
   *   looked at the scoreboard, which is the exact multi-round skip 0b7fb3b
   *   closed from the other end.
   * - The LOCK, because the guard alone still loses the race. This ran on the
   *   pooled client, so a ready write could commit AFTER a deal had reset
   *   `isReady: false` - the `players` row is not covered by the `games` row
   *   lock, so the two only serialize if this takes the lock too. Behind it, a
   *   write that arrives after a deal reads `playing` and is refused instead of
   *   resurrecting a stale `true`.
   *
   * The lock earns its keep a second way now: between rounds the LAST ready-up
   * deals the next round itself (`advanceRound`), in this same transaction.
   * There is no host "start next round" action - the round advances the moment
   * the table is ready. Two players readying up at once therefore serialize on
   * the game row: whichever completes the set advances to `playing` under the
   * lock, and any ready write behind it reads `playing` at the guard above and
   * is refused before it can recompute anything - so the deal happens exactly
   * once. The lobby's first deal is deliberately NOT here: it stays host-gated
   * in `startGame`, so only a `round_over` game auto-advances.
   */
  async setPlayerReady(
    gameId: string,
    playerId: string,
    isReady: boolean
  ): Promise<void> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: { players: true },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      // The two states a deal can be waiting on, and the only two where
      // readiness means anything.
      if (game.status !== "waiting" && game.status !== "round_over") {
        throw new BadRequestException(
          "Readiness can only be changed in the lobby or between rounds"
        );
      }

      const player = game.players.find((p) => p.id === playerId);
      if (!player) {
        throw new NotFoundException("Player not found");
      }

      await tx.player.update({
        where: { id: playerId },
        data: { isReady },
      });

      // Between rounds, the final ready-up advances the round itself. Recompute
      // readiness over the POST-write set - this player's new `isReady` patched
      // in over the pre-write read - and deal only when the whole table is
      // ready, MIN_PLAYERS included. Under the game lock this read reflects
      // every other player's committed readiness, so "am I the last?" is
      // answered correctly and the advance is atomic with the write above.
      //
      // Only `round_over`: a fully-ready lobby must still wait for the host's
      // `startGame`, so `waiting` is left out on purpose.
      if (game.status === "round_over") {
        const readiedPlayers = game.players.map((p) =>
          p.id === playerId ? { ...p, isReady } : p
        );
        if (
          readiedPlayers.length >= GAME_CONSTANTS.MIN_PLAYERS &&
          readiedPlayers.every((p) => p.isReady)
        ) {
          await this.advanceRound(tx, game);
        }
      }
    });
  }

  /**
   * Call Blitz: score the round, then either end the round or end the game.
   *
   *   playing --callBlitz--> round_over   when max(cumulative) <  targetScore
   *   playing --callBlitz--> finished     when max(cumulative) >= targetScore
   *
   * Runs under the game lock, and this is the method that most needs it.
   * Scoring reads every player's `bankPileCount` while in-flight moves are
   * still incrementing it, so without the lock the scores handed back to one
   * player disagree with the ones written to the database.
   *
   * The lock is also the whole defence against a double Blitz, and it works by
   * making the `status !== "playing"` check below MEAN something: two callers
   * in the same millisecond both used to pass it, because both read `playing`
   * before either wrote. Now the second one blocks on the row until the first
   * commits, then reads `round_over`/`finished` and bails - having scored
   * nothing, accumulated nothing and advanced no round. Move that read outside
   * the lock and the check silently goes back to being decorative.
   */
  async callBlitz(
    gameId: string,
    playerId: string
  ): Promise<{
    success: boolean;
    winnerId: string | null;
    /** Each player's CUMULATIVE score after this round. */
    scores: Record<string, number>;
    /** What each player scored in THIS round alone. */
    roundScores: Record<string, number>;
    status: "round_over" | "finished";
    round: number;
    /** Unredacted, read inside the transaction. The gateway redacts it. */
    state: GameState;
  }> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        // Ordered so a tie resolves the same way every time rather than
        // however Postgres happened to return the rows.
        include: { players: { orderBy: { id: "asc" } } },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      if (game.status !== "playing") {
        throw new BadRequestException("Game is not in progress");
      }

      const callingPlayer = game.players.find((p) => p.id === playerId);
      if (!callingPlayer) {
        throw new NotFoundException("Player not found");
      }

      const callingPlayerDeck = this.parseDeck(playerId, callingPlayer.deck);

      // Validate that the calling player's Blitz pile is empty
      if (callingPlayerDeck.blurtzPile.cards.length > 0) {
        throw new BadRequestException(
          "Cannot call Blitz - your Blitz pile is not empty"
        );
      }

      const round = game.currentRound;
      const scores: Record<string, number> = {};
      const roundScores: Record<string, number> = {};
      let highestScore = -Infinity;
      let winnerPlayerId: string | null = null;

      for (const player of game.players) {
        const deck = this.parseDeck(player.id, player.deck);
        const blurtzRemaining = deck.blurtzPile.cards.length;
        const roundScore = scoreRound(player.bankPileCount, blurtzRemaining);
        // ADD, do not overwrite. `score` is the running total across rounds -
        // this line used to be `score: finalScore`, which silently threw every
        // previous round away and is why a game could never reach a target.
        const cumulativeScore = player.score + roundScore;

        scores[player.id] = cumulativeScore;
        roundScores[player.id] = roundScore;

        await tx.player.update({
          where: { id: player.id },
          data: { score: cumulativeScore, roundScore },
        });

        // The scoring INPUTS, recorded before the round advance resets them.
        // `bankPileCount` in particular exists nowhere else once the next
        // round is dealt, so a disputed score is answerable only from here.
        await tx.roundResult.create({
          data: {
            gameId,
            playerId: player.id,
            round,
            bankPileCount: player.bankPileCount,
            blurtzRemaining,
            roundScore,
            cumulativeScore,
            calledBlurtz: player.id === playerId,
          },
        });

        if (cumulativeScore > highestScore) {
          highestScore = cumulativeScore;
          winnerPlayerId = player.id;
        }
      }

      const isFinished = highestScore >= game.targetScore;

      await tx.game.update({
        where: { id: gameId },
        data: {
          status: isFinished ? "finished" : "round_over",
          // A round_over game has no winner - it has a leader. Writing one
          // here would make every scoreboard between rounds claim the game was
          // already decided.
          winnerPlayerId: isFinished ? winnerPlayerId : null,
        },
      });

      if (isFinished) {
        // The transition to `finished`, and the only place a Blitz reaches it.
        // Inside the transaction on purpose: a Blitz that loses the race above
        // rolls back, and must not leave a gamesPlayed behind it.
        await this.userService.recordGameResults(
          tx,
          game.players.map((p) => ({
            userId: p.userId,
            won: p.id === winnerPlayerId,
          }))
        );
      }

      this.logger.log(
        `Blitz called by ${playerId} in game ${gameId} - round ${round} ` +
          `${isFinished ? `won by ${winnerPlayerId}` : "over, game continues"}`
      );

      return {
        success: true,
        // Only a finished game has a winner.
        winnerId: isFinished ? winnerPlayerId : null,
        scores,
        roundScores,
        status: isFinished ? ("finished" as const) : ("round_over" as const),
        round,
        state: await this.readGameState(tx, gameId),
      };
    });
  }

  // Gameplay

  /**
   * Play a card, or explain why it cannot be played.
   *
   * This is the method the whole locking story is about. Every player plays at
   * once and they are all racing for the same bank piles, so "two moves at the
   * same instant" is the normal case. The read, the validation, the deck write
   * and the gameState write all happen inside one `withGameLock` transaction,
   * which is what makes the loser of a race see the winner's card already
   * sitting on the pile and correctly reject.
   *
   * The returned state is read inside that same transaction, so the caller
   * never has to go back to the database for it - a re-read after commit would
   * be a fresh race of its own, and could show a state this move never
   * produced.
   */
  async moveCard(
    gameId: string,
    playerId: string,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ): Promise<MoveResult> {
    return this.gameRepository.withGameLock(gameId, async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: { players: true },
      });

      if (!game) {
        throw new NotFoundException("Game not found");
      }

      if (game.status !== "playing") {
        throw new BadRequestException("Game is not in progress");
      }

      const player = game.players.find((p) => p.id === playerId);
      if (!player) {
        throw new NotFoundException("Player not found");
      }

      const playerDeck = this.parseDeck(playerId, player.deck);
      const gameState = game.gameState as any;

      // Validate the move
      const rejection = validateMove(
        playerDeck,
        gameState,
        cardId,
        fromPileId,
        toPileId
      );

      if (rejection) {
        // A rejection still carries state, read under the same lock: the
        // client needs a fresh object to reconcile the move it optimistically
        // hid, and the reason it lost the race is in that state.
        return {
          ok: false as const,
          state: await this.readGameState(tx, gameId),
          reason: rejection,
        };
      }

      executeMove(playerDeck, gameState, cardId, fromPileId, toPileId);

      // Check if this was a move to a Bank pile (for scoring)
      const isBankPileMove = gameState.bankPiles?.some(
        (p: Pile) => p.id === toPileId
      );

      await tx.player.update({
        where: { id: playerId },
        data: {
          deck: JSON.parse(JSON.stringify(playerDeck)),
          // Increment bank pile count if moved to bank pile
          ...(isBankPileMove && { bankPileCount: { increment: 1 } }),
        },
      });
      await tx.game.update({
        where: { id: gameId },
        data: { gameState },
      });

      return { ok: true as const, state: await this.readGameState(tx, gameId) };
    });
  }

  // The round scoreboard
  //
  // `createSnapshot` / `getSnapshots` / `getLatestSnapshot` /
  // `deleteSnapshots` used to live here, over a `game_snapshots` table that
  // `startGame` wrote one whole-state blob into and nothing ever read back.
  // Its REST routes were already deleted as an unscoped leak. `RoundResult` is
  // what a multi-round game actually wanted: the scoring inputs, per player
  // per round, queryable.

  /**
   * Every round's scoring, oldest first - the game's scoreboard.
   *
   * Returns the INPUTS as well as the totals, so "why is my score that?" is
   * answerable from the row: `bankPileCount` is reset by each round advance
   * and survives nowhere else.
   */
  async getRoundResults(gameId: string) {
    return this.prisma.roundResult.findMany({
      where: { gameId },
      orderBy: [{ round: "asc" }, { playerId: "asc" }],
    });
  }
}
