/**
 * `@blurtz/shared` - the one home for the game's rules, domain types and
 * constants.
 *
 * Nothing here may import from `client/` or `server/`, reach for a database,
 * a logger, Nest, React or the DOM. This package is compiled once and consumed
 * by both sides through the node_modules symlink npm workspaces creates, which
 * is why neither side needs a path alias to reach it.
 *
 * What lives here is what BOTH sides have to agree on to be playing the same
 * game: the placement rules, the shape of a card, and the names of the socket
 * events. The rules used to exist in four hand-copied places that had drifted
 * into disagreeing with each other - most memorably, the client's copy thought
 * an empty work pile only took a 10. There is one copy now.
 *
 * What does NOT live here: anything only one side needs. Zod schemas stay in
 * the server (they police the database boundary, and the client has no reason
 * to carry a parser); API request/response shapes and UI types stay in their
 * own packages.
 */
export * from "./constants";
export * from "./types";
export * from "./rules";
