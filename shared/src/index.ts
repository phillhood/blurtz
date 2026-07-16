/**
 * `@blurtz/shared` - the one home for the game's rules, domain types and
 * constants: whatever BOTH sides must agree on to be playing the same game.
 *
 * Nothing here may import from `client/` or `server/`, or reach for a database,
 * a logger, Nest, React or the DOM. Anything only one side needs (zod schemas,
 * API shapes, UI types) belongs in that side's package.
 */
export * from "./constants";
export * from "./types";
export * from "./rules";
