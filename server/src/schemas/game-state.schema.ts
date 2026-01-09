import { z } from "zod";

export const CardColorSchema = z.object({
  name: z.string(),
  code: z.string(),
  type: z.enum(["a", "b"]),
});

export const CardSchema = z.object({
  id: z.string().uuid(),
  value: z.number().min(1).max(10),
  number: z.number().min(1).max(10),
  color: CardColorSchema,
  faceUp: z.boolean(),
  ownerId: z.string().uuid().optional(),
});

export const PileSchema = z.object({
  id: z.string(),
  type: z.enum(["blurtz", "work", "draw", "bank"]),
  cards: z.array(CardSchema),
});

export const PlayerDeckSchema = z.object({
  blurtzPile: PileSchema,
  workPiles: z.array(PileSchema),
  drawPile: PileSchema,
});

export const PlayerStateSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  isReady: z.boolean(),
  deck: PlayerDeckSchema.nullable(),
  score: z.number(),
});

export const GameStateDataSchema = z.object({
  bankPiles: z.array(PileSchema),
  currentTurn: z.union([z.string(), z.number()]),
});

export const FullGameStateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  alias: z.string(),
  maxPlayers: z.number().min(2).max(4),
  currentPlayers: z.number(),
  players: z.array(PlayerStateSchema.extend({
    user: z.object({
      id: z.string(),
      username: z.string(),
    }),
  })),
  bankPiles: z.array(PileSchema),
  status: z.enum(["waiting", "starting", "playing", "paused", "finished"]),
  currentRound: z.number(),
  currentTurn: z.string(),
  winner: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
});

// Type exports inferred from schemas
export type CardColor = z.infer<typeof CardColorSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Pile = z.infer<typeof PileSchema>;
export type PlayerDeck = z.infer<typeof PlayerDeckSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type GameStateData = z.infer<typeof GameStateDataSchema>;
export type FullGameState = z.infer<typeof FullGameStateSchema>;

// Validation helpers
export function validateGameStateData(data: unknown): GameStateData {
  return GameStateDataSchema.parse(data);
}

export function validatePlayerDeck(data: unknown): PlayerDeck {
  return PlayerDeckSchema.parse(data);
}

export function safeValidateGameStateData(data: unknown) {
  return GameStateDataSchema.safeParse(data);
}

export function safeValidatePlayerDeck(data: unknown) {
  return PlayerDeckSchema.safeParse(data);
}
