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
// Resolved through the workspace symlink, not a path alias - see shared/src/index.ts.
import {
  createBankPiles,
  dealCards,
  executeMove,
  // Aliased: this service's own `flipDrawPile` is the DB-facing wrapper around it.
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
   * The throwing gate on the lobby deal: being the host is not enough, every
   * player must have readied up. `setPlayerReady` asks the SAME question between
   * rounds, but as a boolean - a not-yet-ready table there is the normal case,
   * not an error, so it waits and auto-advances once this condition holds.
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
   * `reset` carries the per-round counters, merged into the same write. It must
   * NEVER carry `score`: that is cumulative, and the only thing `targetScore` is
   * measured against.
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
   * `Player.deck` is an opaque JSON blob and nothing at the type level stops it
   * from being half-written or left behind by an older shape. A corrupt deck
   * must fail loudly here rather than be half-played into a game.
   *
   * Returns the validated original, not Zod's parsed clone: the domain types in
   * `@types` are the authority, and the schema's job is to police the boundary,
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
   * load-bearing rather than tidiness: `deck` is a scalar, so an
   * `include: { players: ... }` selects it like any other column - and this game
   * goes straight back to the caller as the `joinByCode` response body, handing
   * a rejoining player every opponent's face-down cards past everything the
   * gateway redacts. The only caller needs `id`.
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

    // Every status except `finished` - a game you are in and that is not over is
    // a game you can get back to, the round_over interstitial included: the round
    // cannot advance until the players sitting in it ready up.
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

  async createGame(
    name: string,
    userId: string,
    maxPlayers: number = 2,
    isPrivate: boolean = false,
    targetScore: number = GAME_CONSTANTS.DEFAULT_TARGET_SCORE
  ) {
    const alias = await this.generateUniqueAlias();
    const savedGame = await this.prisma.game.create({
      data: {
        name,
        alias,
        maxPlayers,
        isPrivate,
        targetScore,
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
   * `allowPrivate` gates joining a game marked private: knowing a private game's
   * id is not permission to enter it, only its invite code is, so only the
   * join-by-code path passes true. Players already in the game are always let
   * back in, so this cannot lock anyone out of a rejoin.
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
   * Resolve the Player row id for a (game, user) pair; null if the user is not a
   * player in the game. The gateway derives identity from this rather than
   * trusting a playerId sent over the wire.
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
   * out of a game has to answer this question. `startGame` demands host AND
   * membership, so a `hostId` pointing at someone who has left is a lobby nobody
   * can start: the host is not in it, and everyone who is in it is not the host.
   * The departed host can still start it over REST, too.
   *
   * No-ops when the leaver was not the host, or when nobody is left to take it -
   * a game with no players is being finished by its caller anyway.
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

      // A finished game is a RECORD. `Game.winnerPlayerId` is ON DELETE SET NULL
      // (deliberately - see the schema), so deleting a Player row out of one
      // silently nulls the winner it named, and the host reassignment below then
      // hands the game to the loser on its way past.
      //
      // A NO-OP, not a rejection, and the difference is the client: leaving a
      // finished game is the normal way out of one, and the gateway only reaches
      // `client.leave(gameId)` if this returns - throwing would put an error
      // toast on the end of every completed game AND strand the socket in the
      // room.
      if (game.status === "finished") {
        this.logger.log(
          `Player ${userId} left finished game ${gameId} - record preserved`
        );
        return this.readGameState(tx, gameId);
      }

      // An in-progress game - being played, or sat in the round-over
      // interstitial - is left by forfeiting it. The game was read under the
      // lock, so hand it straight over rather than re-reading it.
      if (game.status === "playing" || game.status === "round_over") {
        this.logger.log(
          `Player ${userId} leaving active game ${gameId} (${game.status}) - treating as forfeit`
        );
        return this.applyForfeit(tx, game, player.id);
      }

      // `starting` and `paused` exist in the GameStatus enum and nothing writes
      // either of them. Refuse rather than guess: the lobby path below would
      // delete a player out of a `paused` game. If either status is ever made
      // real, this is the line that will say so.
      if (game.status !== "waiting") {
        throw new BadRequestException(
          `Cannot leave a game with status ${game.status}`
        );
      }

      this.logger.log(`Player ${userId} left game ${gameId}`);

      // The lobby path: nobody has been dealt a card here.
      const remainingPlayers = game.players.filter((p) => p.id !== player.id);

      // No `recordGameResults` here, deliberately: this game was never played.
      // It is a lobby nobody turned up to, reaching `finished` because that is
      // the only terminal status there is. Crediting a gamesPlayed for it would
      // let anyone inflate their stats by creating and leaving games in a loop.
      // Stats are credited where a game is actually DECIDED: a Blitz that
      // reaches the target, or a forfeit out of a game in progress.
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
   * Runs under the game lock. A forfeit ends the game and so does a Blitz - they
   * must not both be allowed to decide how. Read the game through the pooled
   * client and a forfeit racing a Blitz picks a winner off the pre-Blitz
   * `playing` row, then blocks on the row lock and writes that stale winner
   * straight over the committed Blitz.
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
   * status check below is only a real guard because of that: it is what makes a
   * forfeit arriving behind a committed Blitz observe `finished` and bail
   * instead of clobbering it. Read the game anywhere else and the check is just
   * a stale value.
   *
   * "In progress" means `playing` OR `round_over`. The interstitial is part of
   * the game: rounds have been played, score is on the board and RoundResults
   * are written, so walking out of it ends the game the same way walking out of
   * `playing` does. `finished` is refused - that is the half the Blitz race
   * needs.
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
      // it. Fired here rather than in `forfeitGame` so it covers the socket
      // forfeit AND `leaveGame`'s forfeit path.
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
      // More than one player left: the game plays on and nothing is credited,
      // but the host role must still name a player who is actually in it.
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

      // `isReady` is consumed by the deal, exactly as in `advanceRound`. Nothing
      // else clears it - `callBlitz` does not - so a lobby `true` left standing
      // here survives all of round 1 and pre-satisfies the round-over ready-up
      // gate, dealing round 2 before anyone has seen the scoreboard.
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
   * Deal the next round: round_over --(the last player readies up)--> playing.
   *
   * `game` must have been read off `tx` inside `withGameLock`. The deal is then
   * atomic with the ready write that triggers it, which is what stops two
   * simultaneous final ready-ups double-dealing.
   *
   * Kept out of `startGame`: one method that deals either a `waiting` or a
   * `round_over` game is one status check away from re-dealing a live game.
   */
  private async advanceRound(
    tx: DbClient,
    game: { id: string; currentRound: number; players: Array<{ id: string }> }
  ): Promise<void> {
    // `score` is NOT in this list and must never be: it is the running total the
    // game is played to.
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
   * instead: this one reads on another connection, outside their transaction,
   * and cannot see their own uncommitted writes.
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
      currentRound: game.currentRound,
      targetScore: game.targetScore,
      // Read directly rather than resolved through `players.find`: the column is
      // a real FK with ON DELETE SET NULL, so a winner whose Player row is gone
      // is already null here and there is nothing for a lookup to launder.
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
   * `isReady` is the gate on BOTH deals, and needs the guard below AND the lock.
   * The `players` row is not covered by the `games` row lock, so a ready write
   * and a deal that resets `isReady: false` only serialize if this takes the
   * lock too; behind it, a write arriving after a deal reads `playing` at the
   * guard and is refused instead of resurrecting a stale `true`.
   *
   * Between rounds the LAST ready-up deals the next round itself
   * (`advanceRound`), in this same transaction, so two players readying up at
   * once serialize on the game row and the deal happens exactly once. The
   * lobby's first deal is deliberately NOT here: it stays host-gated in
   * `startGame`, so only a `round_over` game auto-advances.
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

      // The two states a deal can be waiting on - the only two where readiness
      // means anything.
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

      // Recompute readiness over the POST-write set - this player's new
      // `isReady` patched in over the pre-write read - and deal only when the
      // whole table is ready. Under the game lock this read reflects every other
      // player's committed readiness, so "am I the last?" is answered correctly.
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
   * Score the round, then end the round or the game:
   *
   *   playing --callBlitz--> round_over   when max(cumulative) <  targetScore
   *   playing --callBlitz--> finished     when max(cumulative) >= targetScore
   *
   * The lock is what makes the `status !== "playing"` check below mean anything:
   * it holds the second caller until the first commits, so a double Blitz reads
   * `round_over` and bails instead of scoring twice. Scoring also reads
   * `bankPileCount` while in-flight moves are still incrementing it.
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
        // ADD, do not overwrite: `score` is the running total across rounds and
        // the only thing `targetScore` is measured against. Overwrite it and a
        // game can never reach a target.
        const cumulativeScore = player.score + roundScore;

        scores[player.id] = cumulativeScore;
        roundScores[player.id] = roundScore;

        await tx.player.update({
          where: { id: player.id },
          data: { score: cumulativeScore, roundScore },
        });

        // The scoring INPUTS, recorded before the round advance resets them.
        // `bankPileCount` exists nowhere else once the next round is dealt, so a
        // disputed score is answerable only from here.
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
          // A round_over game has no winner - it has a leader. Writing one here
          // would make every between-rounds scoreboard claim the game was
          // already decided.
          winnerPlayerId: isFinished ? winnerPlayerId : null,
        },
      });

      if (isFinished) {
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

  /**
   * Play a card, or explain why it cannot be played.
   *
   * This is the method the whole locking story is about. Every player plays at
   * once and they are all racing for the same bank piles, so "two moves at the
   * same instant" is the normal case. The read, the validation, the deck write
   * and the gameState write all happen inside one `withGameLock` transaction,
   * which is what makes the loser of a race see the winner's card already on the
   * pile and correctly reject.
   *
   * The returned state is read inside that same transaction: a re-read after
   * commit would be a fresh race of its own, and could show a state this move
   * never produced.
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

      const rejection = validateMove(
        playerDeck,
        gameState,
        cardId,
        fromPileId,
        toPileId
      );

      if (rejection) {
        // A rejection still carries state, read under the same lock: the client
        // needs a fresh object to reconcile the move it hid, and the reason it
        // lost the race is in that state.
        return {
          ok: false as const,
          state: await this.readGameState(tx, gameId),
          reason: rejection,
        };
      }

      executeMove(playerDeck, gameState, cardId, fromPileId, toPileId);

      // Bank moves are the scoring input `callBlitz` reads.
      const isBankPileMove = gameState.bankPiles?.some(
        (p: Pile) => p.id === toPileId
      );

      await tx.player.update({
        where: { id: playerId },
        data: {
          deck: JSON.parse(JSON.stringify(playerDeck)),
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

  /**
   * Every round's scoring, oldest first - the game's scoreboard.
   *
   * Returns the INPUTS as well as the totals, so "why is my score that?" is
   * answerable from the row: `bankPileCount` is reset by each round advance and
   * survives nowhere else.
   */
  async getRoundResults(gameId: string) {
    return this.prisma.roundResult.findMany({
      where: { gameId },
      orderBy: [{ round: "asc" }, { playerId: "asc" }],
    });
  }
}
