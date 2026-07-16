import { z } from "zod";
import {
  Card,
  CardColor,
  GameplayState,
  Pile,
  PlayerDeck,
} from "@blurtz/shared";

/**
 * The database boundary's parsers.
 *
 * These stay in the server, and zod stays out of `@blurtz/shared`, because
 * this is the only side that reads a `Player.deck` JSON blob back out of
 * Postgres and has to ask whether it is still a deck. The client is handed
 * state by a server that has already checked.
 *
 * Every schema is annotated `z.ZodType<T>` against the hand-written domain type
 * it parses, and that annotation is the point: it makes the compiler reject a
 * schema that has drifted from the type. The types are NOT `z.infer` versions of
 * these schemas - the dependency deliberately runs schema -> type, so the domain
 * stays readable and zod-free and the parser is what has to keep up.
 */

export const CardColorSchema: z.ZodType<CardColor> = z.object({
  name: z.string(),
  code: z.string(),
  type: z.enum(["a", "b"]),
});

// Decks stored before `number`/`ownerId` left `Card` still carry them. Zod
// strips unknown keys rather than rejecting, so an old row still parses and the
// next write drops them.
export const CardSchema: z.ZodType<Card> = z.object({
  id: z.string().uuid(),
  value: z.number().min(1).max(10),
  color: CardColorSchema,
  faceUp: z.boolean(),
});

export const PileSchema: z.ZodType<Pile> = z.object({
  id: z.string(),
  type: z.enum(["blurtz", "work", "draw", "bank"]),
  cards: z.array(CardSchema),
});

export const PlayerDeckSchema: z.ZodType<PlayerDeck> = z.object({
  blurtzPile: PileSchema,
  workPiles: z.array(PileSchema),
  drawPile: PileSchema,
});

export const GameStateDataSchema: z.ZodType<GameplayState> = z.object({
  bankPiles: z.array(PileSchema),
});

export function validateGameStateData(data: unknown): GameplayState {
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
