/**
 * The rules engine's public surface.
 *
 * Deliberately NOT reachable through a `@`-alias: this whole directory is
 * destined to be `git mv`d into a package shared with the client, and a
 * server-only path alias would just have to be unpicked again. Import it
 * relatively - `./rules` from the game module.
 */
export * from "./engine";
