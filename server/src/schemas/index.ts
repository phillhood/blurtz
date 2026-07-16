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

// The `z.infer` type aliases that used to be re-exported from here are gone.
// They shadowed the real domain types with structurally-similar-but-separate
// copies, which is exactly the drift this package's `z.ZodType<T>` pins now
// prevent. Card, CardColor, Pile and PlayerDeck come from `@blurtz/shared`.
