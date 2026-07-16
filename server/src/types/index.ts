// The game's domain types (Card, Pile, PlayerDeck, GameState, User, ...) live in
// `@blurtz/shared` - import them from there, not from here. Re-exporting them
// would leave two names for one type. What is left is what only the server's
// HTTP layer needs.
export * from "./api.types";
