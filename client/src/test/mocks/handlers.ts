import { http, HttpResponse } from "msw";

const API_URL = "http://localhost:3001";

// Mock data
export const mockUser = {
  id: "user-1",
  username: "testuser",
  gamesPlayed: 5,
  gamesWon: 2,
};

export const mockGames = [
  {
    id: "game-1",
    name: "Test Game 1",
    alias: "happy-blue-cat",
    maxPlayers: 4,
    isPrivate: false,
    status: "waiting",
    players: [{ id: "player-1", user: mockUser, isReady: false, score: 0 }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "game-2",
    name: "Test Game 2",
    alias: "swift-red-dog",
    maxPlayers: 2,
    isPrivate: true,
    status: "waiting",
    players: [],
    createdAt: new Date().toISOString(),
  },
];

export const handlers = [
  // Auth handlers
  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    if (body.username === "testuser" && body.password === "password123") {
      return HttpResponse.json({
        user: mockUser,
        token: "mock-jwt-token",
      });
    }
    return HttpResponse.json(
      { message: "Invalid credentials" },
      { status: 401 }
    );
  }),

  http.post(`${API_URL}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    return HttpResponse.json({
      user: { ...mockUser, username: body.username },
      token: "mock-jwt-token",
    });
  }),

  http.get(`${API_URL}/auth/profile`, () => {
    return HttpResponse.json(mockUser);
  }),

  // Game handlers
  http.get(`${API_URL}/game/available`, () => {
    return HttpResponse.json(mockGames.filter((g) => !g.isPrivate));
  }),

  http.get(`${API_URL}/game/active`, () => {
    return HttpResponse.json(mockGames.filter((g) => g.status === "playing"));
  }),

  http.post(`${API_URL}/game`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      maxPlayers: number;
      isPrivate: boolean;
    };
    const newGame = {
      id: `game-${Date.now()}`,
      name: body.name,
      alias: "new-test-game",
      maxPlayers: body.maxPlayers,
      isPrivate: body.isPrivate,
      status: "waiting",
      players: [],
      createdAt: new Date().toISOString(),
    };
    return HttpResponse.json(newGame, { status: 201 });
  }),

  http.post(`${API_URL}/game/join`, async ({ request }) => {
    const body = (await request.json()) as { id?: string; alias?: string };
    const game = mockGames.find(
      (g) => g.id === body.id || g.alias === body.alias
    );
    if (game) {
      return HttpResponse.json({ ...game, id: game.id });
    }
    return HttpResponse.json({ message: "Game not found" }, { status: 404 });
  }),

  http.get(`${API_URL}/game/:gameId`, ({ params }) => {
    const game = mockGames.find((g) => g.id === params.gameId);
    if (game) {
      return HttpResponse.json(game);
    }
    return HttpResponse.json({ message: "Game not found" }, { status: 404 });
  }),

  // User handlers
  http.get(`${API_URL}/user/:userId`, ({ params }) => {
    if (params.userId === mockUser.id) {
      return HttpResponse.json(mockUser);
    }
    return HttpResponse.json({ message: "User not found" }, { status: 404 });
  }),
];
