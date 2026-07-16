export {
  CardColorSchema,
  CardSchema,
  PileSchema,
  PlayerDeckSchema,
  GameStateDataSchema,
  validateGameStateData,
  validatePlayerDeck,
  safeValidateGameStateData,
  safeValidatePlayerDeck,
} from "./game-state.schema";

// No `z.infer` aliases re-exported from here: they would shadow the real domain
// types with structurally-similar-but-separate copies, which is the drift this
// package's `z.ZodType<T>` pins exist to prevent. Card, CardColor, Pile and
// PlayerDeck come from `@blurtz/shared`.
