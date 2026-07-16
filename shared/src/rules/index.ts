/**
 * The rules engine's public surface.
 *
 * This directory used to live at `server/src/game/rules/`, and was kept off
 * the server's `@`-aliases precisely so that this move could be a `git mv`. It
 * made the trip. Both sides reach it as `@blurtz/shared` now, through the
 * symlink npm workspaces creates - no path alias on either side, which is the
 * whole argument for a real package over a `@shared` mapping.
 */
export * from "./engine";
export * from "./redact";
