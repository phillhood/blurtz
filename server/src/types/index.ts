// The game's domain types (Card, Pile, PlayerDeck, GameState, User, ...) are
// NOT here any more - they live in `@blurtz/shared`, which the client and the
// server both import by name through the workspace symlink. Re-exporting them
// from `@types` would just be a `@shared` alias wearing a different hat, and
// would leave two names for one type. Import them from `@blurtz/shared`.
//
// What is left is what only the server's HTTP layer needs.
export * from "./api.types";
