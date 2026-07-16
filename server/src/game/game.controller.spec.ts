import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { GameController } from "./game.controller";
import { GameService } from "./game.service";

/**
 * The REST surface's tests.
 *
 * `GET /api/game/:id/state` is the reason this file exists. It is guarded by
 * JwtAuthGuard, which proves the caller is SOMEBODY - it never proved they
 * were somebody in this game, so any logged-in user who could name a game id
 * read the whole deal. These pin both halves of the fix: membership, and
 * redaction of what a member gets back.
 */

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_USER_ID = "user-member";
const OUTSIDER_USER_ID = "user-outsider";
const PLAYER_ID = "player-1";

const HIDDEN_CARD_ID = "77777777-7777-4777-8777-777777777777";
const VISIBLE_CARD_ID = "88888888-8888-4888-8888-888888888888";
const DRAW_PILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A request as JwtAuthGuard leaves it: the user id is `sub`. */
function requestFor(userId: string) {
  return { user: { sub: userId } };
}

/** Internal state as GameService really returns it - values and all. */
function internalState() {
  return {
    id: GAME_ID,
    status: "playing",
    players: [
      {
        id: PLAYER_ID,
        deck: {
          blurtzPile: { id: "blurtz-1", type: "blurtz", cards: [] },
          workPiles: [],
          drawPile: {
            id: DRAW_PILE_ID,
            type: "draw",
            cards: [
              {
                id: HIDDEN_CARD_ID,
                value: 7,
                number: 7,
                color: { name: "Red", code: "#DC2626", type: "a" },
                faceUp: false,
              },
              {
                id: VISIBLE_CARD_ID,
                value: 3,
                number: 3,
                color: { name: "Blue", code: "#2563EB", type: "a" },
                faceUp: true,
              },
            ],
          },
        },
      },
    ],
    bankPiles: [],
  };
}

describe("GameController", () => {
  let controller: GameController;
  let gameService: jest.Mocked<GameService>;

  beforeEach(async () => {
    const mockGameService = {
      getGameState: jest.fn(),
      getPlayerIdForUser: jest.fn(),
      startGame: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameController],
      providers: [{ provide: GameService, useValue: mockGameService }],
    }).compile();

    controller = module.get<GameController>(GameController);
    gameService = module.get(GameService);

    jest.clearAllMocks();
  });

  describe("GET :id/state", () => {
    it("rejects a caller who is not a player in the game", async () => {
      // Authenticated, but not in this game.
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await expect(
        controller.getGameState({ id: GAME_ID }, requestFor(OUTSIDER_USER_ID))
      ).rejects.toThrow(ForbiddenException);

      // And the state is never even read - membership is resolved first.
      expect(gameService.getGameState).not.toHaveBeenCalled();
    });

    it("checks membership for the AUTHENTICATED user, not a supplied id", async () => {
      gameService.getPlayerIdForUser.mockResolvedValue(null);

      await expect(
        controller.getGameState({ id: GAME_ID }, requestFor(OUTSIDER_USER_ID))
      ).rejects.toThrow(ForbiddenException);

      expect(gameService.getPlayerIdForUser).toHaveBeenCalledWith(
        GAME_ID,
        OUTSIDER_USER_ID
      );
    });

    it("returns redacted state to a member", async () => {
      gameService.getPlayerIdForUser.mockResolvedValue(PLAYER_ID);
      gameService.getGameState.mockResolvedValue(internalState() as never);

      const response = await controller.getGameState(
        { id: GAME_ID },
        requestFor(MEMBER_USER_ID)
      );

      expect(response.success).toBe(true);

      const cards = response.data.players[0].deck.drawPile.cards;
      expect(cards[0]).toEqual({ id: `hidden:${DRAW_PILE_ID}:0`, faceUp: false });
      expect(cards[1]).toMatchObject({ id: VISIBLE_CARD_ID, value: 3 });
    });

    it("leaks no hidden card into the response body", async () => {
      // Serialise-and-grep: the body is what the member's browser receives.
      gameService.getPlayerIdForUser.mockResolvedValue(PLAYER_ID);
      gameService.getGameState.mockResolvedValue(internalState() as never);

      const response = await controller.getGameState(
        { id: GAME_ID },
        requestFor(MEMBER_USER_ID)
      );
      const body = JSON.stringify(response);

      expect(body).not.toContain(HIDDEN_CARD_ID);
      expect(body).toContain(VISIBLE_CARD_ID);
    });
  });

  describe("POST :id/start", () => {
    it("returns redacted state - the host is not entitled to the deal either", async () => {
      gameService.startGame.mockResolvedValue(internalState() as never);

      const response = await controller.startGame(
        { id: GAME_ID },
        requestFor(MEMBER_USER_ID)
      );

      expect(gameService.startGame).toHaveBeenCalledWith(
        GAME_ID,
        MEMBER_USER_ID
      );
      expect(JSON.stringify(response)).not.toContain(HIDDEN_CARD_ID);
    });
  });
});
