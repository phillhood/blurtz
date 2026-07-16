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
    private gameRepository: GameRepository
  ) {}

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
        winnerId: true,
        createdAt: true,
        updatedAt: true,
        players: {
          select: {
            id: true,
            userId: true,
            isReady: true,
            score: true,
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

    // Include waiting, starting, playing, and paused games - exclude only finished games
    const games = await this.prisma.game.findMany({
      where: {
        status: { in: ["waiting", "starting", "playing", "paused"] },
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
   * Runs under the game lock: leaving an in-progress game ends it, and the
   * waiting-game path is a read-then-delete that can also flip the game to
   * `finished`. Both are game-ending mutations, so they serialize on the same
   * row as everything else.
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

      // If game is playing, this is a forfeit. The game was read under the
      // lock, so hand it straight over rather than re-reading it.
      if (game.status === "playing") {
        this.logger.log(`Player ${userId} leaving active game ${gameId} - treating as forfeit`);
        return this.applyForfeit(tx, game, player.id);
      }

      this.logger.log(`Player ${userId} left game ${gameId}`);

      // Otherwise, normal leave logic for waiting games
      const remainingPlayers = game.players.filter((p) => p.id !== player.id);

      // If no players left in waiting game, mark as finished
      if (remainingPlayers.length === 0) {
        await tx.game.update({
          where: { id: gameId },
          data: { status: "finished" },
        });
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
        include: { players: { select: { id: true } } },
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
   */
  private async applyForfeit(
    tx: DbClient,
    game: { id: string; status: string; players: Array<{ id: string }> },
    playerId: string
  ): Promise<GameState> {
    if (game.status !== "playing") {
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
          winnerId: winner.id,
        },
      });
      this.logger.log(`Player ${playerId} forfeited game ${game.id} - winner: ${winner.id}`);
    } else if (remainingPlayers.length === 0) {
      await tx.game.update({
        where: { id: game.id },
        data: {
          status: "finished",
          winnerId: null,
        },
      });
      this.logger.log(`Player ${playerId} forfeited game ${game.id} - no remaining players`);
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

      if (game.players.length < GAME_CONSTANTS.MIN_PLAYERS) {
        throw new BadRequestException("Not enough players to start the game");
      }

      if (!game.players.every((p) => p.isReady)) {
        throw new BadRequestException(
          "All players must be ready to start the game"
        );
      }

      for (const player of game.players) {
        const deck = dealCards(game.players.length);
        await tx.player.update({
          where: { id: player.id },
          data: { deck: JSON.parse(JSON.stringify(deck)) },
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: { status: "playing" },
      });

      // Create initial snapshot when game starts
      await this.createSnapshot(tx, gameId, 0);

      this.logger.log(
        `Game ${gameId} started with ${game.players.length} players`
      );
      return this.readGameState(tx, gameId);
    });
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

    const winner = game.players.find((p) => p.id === game.winnerId) || null;
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
        bankPileCount: p.bankPileCount,
      })),
      bankPiles: gameState?.bankPiles || createBankPiles(),
      status: game.status,
      currentRound: 0,
      winner: winner?.id || null,
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

  async setPlayerReady(
    gameId: string,
    playerId: string,
    isReady: boolean
  ): Promise<void> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (!game) {
      throw new NotFoundException("Game not found");
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      throw new NotFoundException("Player not found");
    }

    await this.prisma.player.update({
      where: { id: playerId },
      data: { isReady },
    });
  }

  /**
   * Runs under the game lock: scoring reads every player's `bankPileCount`,
   * which in-flight moves are still incrementing. Without the lock a move
   * committing mid-scoring means the scores handed to one player disagree
   * with the ones written to the database.
   */
  async callBlitz(
    gameId: string,
    playerId: string
  ): Promise<{
    success: boolean;
    winnerId: string | null;
    scores: Record<string, number>;
  }> {
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

      // Calculate scores for all players
      const scores: Record<string, number> = {};
      let highestScore = -Infinity;
      let winnerId: string | null = null;

      for (const player of game.players) {
        const deck = player.deck as unknown as PlayerDeck;
        const blurtzRemaining = deck.blurtzPile.cards.length;
        const finalScore = scoreRound(player.bankPileCount, blurtzRemaining);
        scores[player.id] = finalScore;

        // Update player score in database
        await tx.player.update({
          where: { id: player.id },
          data: { score: finalScore },
        });

        if (finalScore > highestScore) {
          highestScore = finalScore;
          winnerId = player.id;
        }
      }

      // End the game
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: "finished",
          winnerId,
        },
      });

      this.logger.log(
        `Blitz called by ${playerId} in game ${gameId} - winner: ${winnerId}`
      );
      return { success: true, winnerId, scores };
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

  // Snapshot management

  /**
   * `client` is explicit because the only caller is `startGame`, which is
   * inside a lock - the snapshot has to be written on that transaction, or it
   * captures a state its own transaction has not committed yet.
   */
  async createSnapshot(
    client: DbClient,
    gameId: string,
    round: number = 0
  ): Promise<void> {
    const gameState = await this.readGameState(client, gameId);

    await client.gameSnapshot.create({
      data: {
        gameId,
        round,
        state: JSON.parse(JSON.stringify(gameState)),
      },
    });
  }

  async getSnapshots(gameId: string): Promise<any[]> {
    const snapshots = await this.prisma.gameSnapshot.findMany({
      where: { gameId },
      orderBy: { createdAt: "asc" },
    });

    return snapshots.map((snapshot) => ({
      id: snapshot.id,
      gameId: snapshot.gameId,
      round: snapshot.round,
      state: snapshot.state,
      createdAt: snapshot.createdAt,
    }));
  }

  async getLatestSnapshot(gameId: string): Promise<any | null> {
    const snapshot = await this.prisma.gameSnapshot.findFirst({
      where: { gameId },
      orderBy: { createdAt: "desc" },
    });

    if (!snapshot) return null;

    return {
      id: snapshot.id,
      gameId: snapshot.gameId,
      round: snapshot.round,
      state: snapshot.state,
      createdAt: snapshot.createdAt,
    };
  }

  async deleteSnapshots(gameId: string): Promise<void> {
    await this.prisma.gameSnapshot.deleteMany({
      where: { gameId },
    });
  }
}
