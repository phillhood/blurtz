import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "@prisma";
import { GameListing, GameState, Card, Pile, PlayerDeck } from "@types";
import { CARD_COLORS, CARD_VALUES, GAME_CONSTANTS, PILE_RULES } from "@utils";
import { generateAlias, generateAliasWithNumber } from "@utils";

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(private prisma: PrismaService) {}

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

  async findGameByAlias(alias: string) {
    return this.prisma.game.findUnique({
      where: { alias },
      include: {
        players: {
          include: { user: true },
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

  private initializeGameState(): any {
    return {
      bankPiles: this.createBankPiles(),
      currentTurn: 0,
    };
  }

  private createFullDeck(): Card[] {
    const cards: Card[] = [];

    Object.values(CARD_COLORS).forEach((color) => {
      CARD_VALUES.forEach((value) => {
        cards.push({
          id: uuidv4(),
          value,
          number: value,
          color,
          faceUp: false,
        });
      });
    });

    return cards;
  }

  private createBankPiles(): Pile[] {
    return Array.from({ length: GAME_CONSTANTS.BANK_PILE_COUNT }, () => ({
      id: uuidv4(),
      type: "bank" as const,
      cards: [],
    }));
  }

  private createPlayerDeck(workPileCount: number): PlayerDeck {
    return {
      blurtzPile: {
        id: uuidv4(),
        type: "blurtz",
        cards: [],
      },
      workPiles: Array.from({ length: workPileCount }, () => ({
        id: uuidv4(),
        type: "work" as const,
        cards: [],
      })),
      drawPile: {
        id: uuidv4(),
        type: "draw",
        cards: [],
      },
    };
  }

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
        gameState: this.initializeGameState(),
      },
    });

    this.logger.log(`Game created: ${savedGame.id} (${alias}) by user ${userId}`);

    await this.joinGame(savedGame.id, userId);

    return savedGame;
  }

  async joinGame(gameId: string, userId: string) {
    const game = await this.prisma.game.findUnique({
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

    if (game.players.length >= game.maxPlayers) {
      throw new BadRequestException("Game is full");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.prisma.player.create({
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
  }

  async leaveGame(gameId: string, userId: string): Promise<GameState> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: true },
        },
      },
    });

    if (!game) {
      throw new Error("Game not found");
    }

    const player = game.players.find((p) => p.user.id === userId);
    if (!player) {
      throw new Error("Player not found in this game");
    }

    // If game is playing, this is a forfeit
    if (game.status === "playing") {
      this.logger.log(`Player ${userId} leaving active game ${gameId} - treating as forfeit`);
      return await this.forfeitGame(gameId, player.id);
    }

    this.logger.log(`Player ${userId} left game ${gameId}`);

    // Otherwise, normal leave logic for waiting games
    const remainingPlayers = game.players.filter((p) => p.id !== player.id);

    // If no players left in waiting game, mark as finished
    if (remainingPlayers.length === 0) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: { status: "finished" },
      });
    }
    await this.prisma.player.delete({ where: { id: player.id } });
    return this.getGameState(gameId);
  }

  async forfeitGame(gameId: string, playerId: string): Promise<GameState> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: true },
        },
      },
    });

    if (!game) {
      throw new Error("Game not found");
    }

    if (game.status !== "playing") {
      throw new Error("Cannot forfeit - game is not in progress");
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error("Player not found in this game");
    }

    const remainingPlayers = game.players.filter((p) => p.id !== playerId);

    if (remainingPlayers.length === 1) {
      const winner = remainingPlayers[0];

      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: "finished",
          winnerId: winner.id,
        },
      });
      this.logger.log(`Player ${playerId} forfeited game ${gameId} - winner: ${winner.id}`);
    } else if (remainingPlayers.length === 0) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: "finished",
          winnerId: null,
        },
      });
      this.logger.log(`Player ${playerId} forfeited game ${gameId} - no remaining players`);
    }
    await this.prisma.player.delete({ where: { id: player.id } });

    return this.getGameState(gameId);
  }

  async startGame(gameId: string): Promise<GameState> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: true },
        },
      },
    });

    if (!game) {
      throw new NotFoundException("Game not found");
    }

    if (game.players.length < GAME_CONSTANTS.MIN_PLAYERS) {
      throw new BadRequestException("Not enough players to start the game");
    }

    for (const player of game.players) {
      const deck = this.dealCards(game.players.length);
      await this.prisma.player.update({
        where: { id: player.id },
        data: { deck: JSON.parse(JSON.stringify(deck)) },
      });
    }

    await this.prisma.game.update({
      where: { id: gameId },
      data: { status: "playing" },
    });

    // Create initial snapshot when game starts
    await this.createSnapshot(gameId, 0);

    this.logger.log(`Game ${gameId} started with ${game.players.length} players`);
    return this.getGameState(gameId);
  }

  async getGameState(gameId: string): Promise<GameState> {
    const game = await this.prisma.game.findUnique({
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
      bankPiles: gameState?.bankPiles || this.createBankPiles(),
      status: game.status,
      currentRound: 0,
      currentTurn: game.players[0]?.id || "",
      winner: winner?.id || null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    };
  }

  async flipDrawPile(
    gameId: string,
    playerId: string
  ): Promise<PlayerDeck> {
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

    const playerDeck = player.deck as unknown as PlayerDeck;
    const drawCards = playerDeck.drawPile.cards;

    // Array structure: [draw pile (face-down at front)][active pile (face-up at end)]
    // Count face-down cards at front (draw pile)
    let drawCount = 0;
    for (const c of drawCards) {
      if (!c.faceUp) drawCount++;
      else break;
    }

    if (drawCount === 0) {
      // Reset: turn all cards face-down (preserves order for cycling)
      drawCards.forEach((c) => (c.faceUp = false));
      drawCount = drawCards.length;
    }

    // Flip up to 3 cards: remove from front, turn face-up, append to end
    const numToFlip = Math.min(3, drawCount);
    if (numToFlip > 0) {
      const toFlip = drawCards.splice(0, numToFlip);
      toFlip.forEach((c) => (c.faceUp = true));
      drawCards.push(...toFlip);
    }

    await this.prisma.player.update({
      where: { id: playerId },
      data: { deck: JSON.parse(JSON.stringify(playerDeck)) },
    });

    return playerDeck;
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

  async callBlitz(
    gameId: string,
    playerId: string
  ): Promise<{ success: boolean; winnerId: string | null; scores: Record<string, number> }> {
    const game = await this.prisma.game.findUnique({
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

    const callingPlayerDeck = callingPlayer.deck as unknown as PlayerDeck;

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
      // Score = cards played to Dutch piles - (2 * remaining Blitz cards)
      const finalScore = player.bankPileCount - 2 * blurtzRemaining;
      scores[player.id] = finalScore;

      // Update player score in database
      await this.prisma.player.update({
        where: { id: player.id },
        data: { score: finalScore },
      });

      if (finalScore > highestScore) {
        highestScore = finalScore;
        winnerId = player.id;
      }
    }

    // End the game
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        status: "finished",
        winnerId,
      },
    });

    this.logger.log(`Blitz called by ${playerId} in game ${gameId} - winner: ${winnerId}`);
    return { success: true, winnerId, scores };
  }

  // Gameplay
  async moveCard(
    gameId: string,
    playerId: string,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ): Promise<boolean> {
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

    const playerDeck = player.deck as unknown as PlayerDeck;
    const gameState = game.gameState as any;

    // Validate the move
    const isValidMove = this.validateMove(
      playerDeck,
      cardId,
      fromPileId,
      toPileId,
      gameState
    );

    if (!isValidMove) {
      return false;
    }

    this.executeMove(playerDeck, gameState, cardId, fromPileId, toPileId);

    // Check if this was a move to a Bank pile (for scoring)
    const isBankPileMove = gameState.bankPiles?.some(
      (p: Pile) => p.id === toPileId
    );

    await this.prisma.player.update({
      where: { id: playerId },
      data: {
        deck: JSON.parse(JSON.stringify(playerDeck)),
        // Increment bank pile count if moved to bank pile
        ...(isBankPileMove && { bankPileCount: { increment: 1 } }),
      },
    });
    await this.prisma.game.update({
      where: { id: gameId },
      data: { gameState },
    });

    return true;
  }

  private dealCards(numPlayers: number): PlayerDeck {
    const workPileCount = GAME_CONSTANTS.WORK_PILE_COUNT[numPlayers];
    const deck = this.createFullDeck();
    this.shuffleDeck(deck);

    const playerDeck = this.createPlayerDeck(workPileCount);

    // Deal 10 cards to blurtz pile (face down except top card)
    for (let i = 0; i < GAME_CONSTANTS.BLURTZ_PILE_SIZE; i++) {
      const card = deck.pop()!;
      card.faceUp = i === GAME_CONSTANTS.BLURTZ_PILE_SIZE - 1; // Only top card face up
      playerDeck.blurtzPile.cards.push(card);
    }

    // Deal 1 card to each work pile (face up)
    for (let i = 0; i < workPileCount; i++) {
      const card = deck.pop()!;
      card.faceUp = true;
      playerDeck.workPiles[i].cards.push(card);
    }

    // Remaining cards go to draw pile (face down)
    playerDeck.drawPile.cards = deck.map((card) => ({
      ...card,
      faceUp: false,
    }));

    return playerDeck;
  }

  private shuffleDeck(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  private validateMove(
    playerDeck: PlayerDeck,
    cardId: string,
    fromPileId: string,
    toPileId: string,
    gameState: any
  ): boolean {
    // Find the card
    const card = this.findCard(playerDeck, cardId);
    if (!card) return false;

    // Check if card is face up and can be moved
    if (!card.faceUp) return false;

    // Get source and destination piles
    const fromPile = this.findPile(playerDeck, gameState, fromPileId);
    const toPile = this.findPile(playerDeck, gameState, toPileId);

    if (!fromPile || !toPile) return false;

    // Check if card can be moved from source pile
    // For draw pile, the top playable card is the last face-up card
    if (fromPile.type === "draw") {
      const faceUpCards = fromPile.cards.filter((c) => c.faceUp);
      const topFaceUpCard = faceUpCards[faceUpCards.length - 1];
      if (topFaceUpCard?.id !== cardId) return false;
    } else if (fromPile.type === "work") {
      // Post piles allow moving any face-up card (with all cards above it)
      // Card just needs to exist in the pile and be face up (already checked above)
      const cardIndex = fromPile.cards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return false;
    } else {
      // Blitz pile - only top card can be moved
      const topCard = fromPile.cards[fromPile.cards.length - 1];
      if (topCard?.id !== cardId) return false;
    }

    // Validate move based on pile types
    return this.isValidPlacement(toPile, card);
  }

  private findCard(playerDeck: PlayerDeck, cardId: string): Card | null {
    const allPiles = [
      playerDeck.blurtzPile,
      playerDeck.drawPile,
      ...playerDeck.workPiles,
    ];

    for (const pile of allPiles) {
      const card = pile.cards.find((c) => c.id === cardId);
      if (card) return card;
    }

    return null;
  }

  private findPile(
    playerDeck: PlayerDeck,
    gameState: any,
    pileId: string
  ): Pile | null {
    if (playerDeck.blurtzPile.id === pileId) return playerDeck.blurtzPile;
    if (playerDeck.drawPile.id === pileId) return playerDeck.drawPile;

    const workPile = playerDeck.workPiles.find((p) => p.id === pileId);
    if (workPile) return workPile;

    const bankPile = gameState.bankPiles?.find((p: Pile) => p.id === pileId);
    if (bankPile) return bankPile;

    return null;
  }

  private isValidPlacement(pile: Pile, card: Card): boolean {
    const topCard = pile.cards[pile.cards.length - 1];

    switch (pile.type) {
      case "work":
        return PILE_RULES.WORK.canPlace(topCard, card);
      case "bank":
        return PILE_RULES.BANK.canPlace(topCard, card);
      default:
        return false;
    }
  }

  private executeMove(
    playerDeck: PlayerDeck,
    gameState: any,
    cardId: string,
    fromPileId: string,
    toPileId: string
  ): void {
    const fromPile = this.findPile(playerDeck, gameState, fromPileId);
    const toPile = this.findPile(playerDeck, gameState, toPileId);

    if (!fromPile || !toPile) return;

    // Find the card index
    const cardIndex = fromPile.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    // For work piles, move the card and all cards above it (stack move)
    // For other piles, just move the single card
    const cardsToMove = fromPile.type === "work"
      ? fromPile.cards.splice(cardIndex) // Remove from cardIndex to end
      : fromPile.cards.splice(cardIndex, 1); // Remove just the one card

    // Add cards to destination pile
    toPile.cards.push(...cardsToMove);

    // If we moved from blurtz pile, flip next card
    if (fromPile.type === "blurtz" && fromPile.cards.length > 0) {
      const nextCard = fromPile.cards[fromPile.cards.length - 1];
      nextCard.faceUp = true;
    }

    // If a bank pile reaches 10 (complete), clear it for reuse
    if (toPile.type === "bank" && toPile.cards.length === 10) {
      toPile.cards = [];
    }
  }

  // Snapshot management
  async createSnapshot(gameId: string, round: number = 0): Promise<void> {
    const gameState = await this.getGameState(gameId);

    await this.prisma.gameSnapshot.create({
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
