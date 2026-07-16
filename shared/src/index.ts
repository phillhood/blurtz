/**
 * `@blurtz/shared` - the one home for the game's rules, domain types and
 * constants.
 *
 * Nothing here may import from `client/` or `server/`, reach for a database,
 * a logger, Nest, React or the DOM. This package is compiled once and consumed
 * by both sides through the node_modules symlink npm workspaces creates, which
 * is why neither side needs a path alias to reach it.
 *
 * This file is deliberately empty at this commit: it exists so the workspace
 * wiring - one root lockfile, `npm ci`, the shared build step in both
 * Dockerfiles, the symlink both packages resolve through - can be proved on
 * its own, before any code is moved into it. The rules arrive next.
 */
export {};
