# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Blurtz is a real-time multiplayer card game based on Nertz. It is an **npm-workspace monorepo with three packages**: `client/` (React 19 + Vite + Tailwind 4 + Zustand), `server/` (NestJS 11 + Prisma/PostgreSQL + Redis + Socket.IO), and `shared/` (`@blurtz/shared` — the game types, constants, socket-event names, the pure rules engine, and state redaction, imported by both sides). There is **one root lockfile**; `@blurtz/shared` resolves through the workspace node_modules symlink, so it needs no path alias. Everything runs through Docker Compose in development.

## Commands

Installs and the workspace build run from the repo root; test and lint run per package (or all at once from root). `make install` first, to populate local `node_modules`.

```bash
make up          # start client, server, db, redis
make down
make rebuild     # down + build --no-cache + up
make clean       # down -v (drops volumes/data)
make logs-server # or logs-client / logs-db / logs-redis
```

Ports: client `3030` → container 3000, server `3031` → container 3001, Postgres `5442`, Redis `6379`. Server routes are prefixed `/api`; Swagger at `/api/docs`, health at `/api/health` (`/live`, `/ready`).

**`shared` ships built.** `main`/`types` point at `dist/`, so it must be compiled before the server or client can resolve it. Root `pretest` and the Docker builds run `build:shared`; if you edit `shared/src` and run a package's tools directly, run `npm run build --workspace=shared` (or `npm run build:shared` from root) first, or `tsc`/jest will see stale output. In the dev containers `shared/src` is volume-mounted and rebuilt on container start.

⚠️ **A new dependency needs `make rebuild`, not `make up`.** Compose mounts `src` but not
`node_modules`, so a package added to any workspace exists on the host and not in the image — the
container then dies on an import the host resolves fine. Same after pulling a branch that adds one.

⚠️ **Vite caches `@blurtz/shared` and does not notice it was rebuilt.** Its pre-bundle in
`client/node_modules/.vite` isn't keyed on a linked workspace package's `dist`, so after changing
`shared` the client can serve a stale copy — a blank page and a new export reading `undefined`, on a
clean tree. `rm -rf client/node_modules/.vite` fixes it. CI is unaffected (it never has a warm cache).

### Database

Prisma migrations run inside the server container:

```bash
make migrate                        # prisma migrate deploy
make migrate-create NAME=add_thing  # prisma migrate dev --name
make migrate-status
make migrate-reset                  # destroys data (prompts)
make prisma-generate
```

The schema's `datasource db` has no `url`; the connection comes from `DATABASE_URL` via `prisma.config.ts` (CLI) and `PrismaService`'s `PrismaPg` adapter (runtime). **Copy `.env.example` to `.env`** — Docker Compose reads it, and the server now **fails fast at boot** if `JWT_SECRET`/`DATABASE_URL`/`REDIS_URL` are missing or invalid (validated by zod in `ConfigModule.forRoot({ validate })`). There is no committed secret fallback.

### Tests and lint

```bash
npm test                                           # root: shared jest → server jest → client vitest (pretest builds shared)

cd shared && npx jest                              # pure rules-engine + redaction suite
cd server && npx jest                              # jest (*.spec.ts colocated in src/)
cd server && npx jest src/game/rules               # (rules now live in shared; game.service/gateway specs are here)
cd server && npx jest -t "should validate a move"

cd client && npm run test:run                      # vitest (src/**/*.test.tsx)
cd client && npm run test:coverage                 # 70% thresholds, enforced and met (@vitest/coverage-v8 is installed)

cd client && npm run test:e2e                      # playwright; its webServer boots BOTH client and server against the test DB
cd client && npx playwright test e2e/auth.spec.ts --project=chromium

make lint                                          # eslint across all workspaces (flat config)
```

`make test` runs the full root suite (all three packages). The e2e `webServer` is an array that boots the API and the client itself, so it passes on a clean checkout; if you run it against the compose stack, `docker compose stop server client` first (Playwright needs those ports) and give the server `NODE_ENV=development` (else `main.ts` closes CORS). Postgres/Redis stay up under compose; there is a `blurtz_test` database for the real-DB integration specs.

## Architecture

### Server is authoritative; the client mirrors it

REST handles auth and the lobby (create/join/list games, profile, stats). Everything in-game goes over Socket.IO. Each mutating gateway handler in `server/src/game/game.gateway.ts` validates the payload, calls `GameService` (which does its own read-modify-write inside a transaction and **returns the new state**), redacts it, and broadcasts to the room. The client never computes game state: `client/src/stores/gameStore.ts` registers callbacks with `socketService` and replaces `gameState` wholesale on every event. There are no optimistic updates — a rejected move produces a `MOVE_REJECTED` event **carrying the current state and a reason** (not a bare error), so the board resolves and the pending card un-hides.

### Socket authentication IS enforced

The client sends its JWT in the Socket.IO handshake (`auth: { token }`). `GameGateway.handleConnection` verifies it (`JwtService.verifyAsync`), sets `client.data.userId`, and disconnects on failure. **Identity never arrives from the wire**: the socket DTOs in `server/src/game/dto/socket-events.dto.ts` contain no `userId`/`playerId` — handlers derive `userId` from `client.data` and resolve the `playerId` via `GameService.getPlayerIdForUser(gameId, userId)`, rejecting non-members. Every handler re-checks membership against the DB before acting. REST routes are protected by `JwtAuthGuard` (`req.user.sub` is the user id).

### Socket errors are typed; fatality is a code, not a message

Every socket error emits `{ code, message, timestamp }` with `code` drawn from `SOCKET_ERROR_CODES` (`shared/src/errors.ts`). The client decides whether to eject to `GameErrorScreen` by the **code alone** (`isFatalErrorCode`, `client/src/utils/error.utils.ts`) — an allowlist where only `GAME_NOT_FOUND` and `NOT_A_PLAYER` are fatal; every other code (including `UNKNOWN`) is a transient toast. **Never branch on message text.** The distinction that carries the design: `NOT_A_PLAYER` (the membership gate refused — fatal) vs `PLAYER_NOT_FOUND` (a row lost to a race *after* the gate accepted — transient by construction, so a race must never be dressed up as `NOT_A_PLAYER`). Codes are injected server-side by throwing Nest exceptions with an object body (`throw new ForbiddenException({ code: NOT_A_PLAYER, ... })`); the gateway's `emitError`/`getErrorCode` read them back, and REST's `ApiError.code` prefers `body.code`, falling back to Nest's `body.error`.

### Presence and reconnection

Presence is **derived from room membership, not stored**: `connectedUserIds(gameId)` runs `this.server.in(gameId).fetchSockets()` and dedupes `socket.data.userId` (`game.gateway.ts`), so two tabs are one present player. Any join or disconnect triggers `broadcastPresence` — a **whole-set** `PRESENCE_UPDATED` (`{ gameId, connectedUserIds, timestamp }`) to the room, never a delta. **`handleDisconnect` does not emit `PLAYER_LEFT`** — a dropped socket has not left: the `Player` row survives and rejoin returns early, so only an explicit `leaveGame` is a departure. The client keeps `connectedUserIds` (null = unknown = treat as present) and a `reconnecting` flag; a mid-game drop keeps the board mounted behind a `ReconnectingBanner` (not the initial-connect screen). Reconnection is infinite (`reconnectionAttempts: Infinity`, `socket.service.ts`), and the gateway sets `pingInterval`/`pingTimeout` to 10s each so a drop surfaces in ~20s rather than Engine.IO's default ~45s.

### Where game state lives, and how writes are serialized

The Prisma models are relational but card state is JSON blobs:

- `Game.gameState` (JSON) — the shared `bankPiles` array (no `currentTurn`; a simultaneous-play game has no turn).
- `Player.deck` (JSON) — that player's `blurtzPile`, `workPiles[]`, `drawPile`.
- `Player.bankPileCount` (column) — incremented per successful bank move; scoring input for `callBlitz()`. **Resets each round.**
- `Player.score` (column) — **cumulative** across rounds; `Player.roundScore` is the per-round display value.
- `RoundResult` — one row per player per round (scoring inputs: `bankPileCount`, `blurtzRemaining`, `roundScore`, `cumulativeScore`, `calledBlurtz`). `GameSnapshot` was removed.

**Every mutation runs inside a Postgres transaction that takes `SELECT … FOR UPDATE` on the game row** (`withGameLock` in `server/src/game/game.repository.ts`, `ReadCommitted`, `lock_timeout '3s'`). Nertz is simultaneous-play — racing two players for the same bank pile is the core mechanic — so the deck write and the gameState write must be atomic and serialized. Everything inside a `withGameLock` callback uses the transaction client `tx`, **never** `this.prisma` (that would escape the transaction and reintroduce the race). Converted mutators: `moveCard`, `flipDrawPile`, `callBlitz`, `startGame`, `startNextRound` (folded into `setPlayerReady`), `setPlayerReady`, `leaveGame`/`forfeitGame`, `joinGame`, and `resolveRoundOverTimeout` (the round-over sweep).

`GameService` guards the acting player's deck at the DB boundary with `PlayerDeckSchema.safeParse` (the zod schemas in `server/src/schemas/game-state.schema.ts` — this is their job, a deserialization guard). A corrupt deck throws rather than being half-played.

### The rules engine lives in `shared`

The pure game logic is free functions in `shared/src/rules/engine.ts`, fully tested (`engine.spec.ts`, `redact.spec.ts`) with no Prisma or Nest. `GameService.moveCard` calls `validateMove` → `executeMove`; the placement rule is `canPlace(pileType, topCard, card)` and the stack-size rule is `cardsMovedBy(fromType, toType, cards, cardId)`. **The client imports the same `canPlace`/`cardsMovedBy`** (`Game.tsx`) to drive drag-and-drop affordances — one authority, both sides.

Key rules: work piles descend by one with **alternating `color.type`** and an empty work pile accepts any card; bank piles ascend by one, **same `color.name`**, starting at 1; only the top card of a work pile may go to a bank pile, and a work→work move takes the card plus everything above it. A completed 1–10 bank pile is **inert** (it can only accept an 11, which does not exist) — it is not cleared or recycled, which is why `BANK_PILE_COUNT: 16` is correct (16 ones in play: 4 colors × 4 players). `flipDrawPile` flips 3 at a time and cycles the waste; it is correct and has a characterization test — don't "fix" it.

### Redaction — no face-down card leaves the server intact

`toClientGameState(state)` (`shared/src/rules/redact.ts`) is applied by the gateway before **every** emission carrying state, and by `GET /api/game/:id/state` (which also checks membership). Redaction is player-**independent** — you can't see your own blurtz pile below the top or your own draw pile's face-down segment either — so `card.faceUp` is the complete visibility predicate and there is no `forPlayerId`; the gateway redacts once and `this.server.to(gameId).emit(...)` keeps working. A hidden card ships as `{ id, faceUp: false }` with a **synthetic** positional id (real ids would let a client build a permanent `id → value` map across draw-pile resets). Mutators return **unredacted** internal state; only the gateway/REST layer redacts.

The client card type is a discriminated union — `VisibleCard { id, value, color, faceUp: true } | HiddenCard { id, faceUp: false }`, defined in `shared/src/rules/redact.ts` and surfaced through `client/src/types/game.types.ts`. Reading `.value` off a hidden card is a compile error.

### Multi-round

Real Nertz to a target score. `Game.targetScore` is **set at creation** — `CreateGameDto` validates it to 10–500 (default 100), `CreateGameModal` offers presets plus a custom input, and the DTO is the authority (the client only pre-validates). `callBlitz` scores the round, then `playing → round_over` (below `targetScore`) or `→ finished` (at/above it). A `round_over` game **auto-advances to the next round when the last player readies up** (`setPlayerReady`, inside the lock): `currentRound++`, re-deal, reset `bankPileCount`/`roundScore`/`isReady`, keep cumulative `score`.

A `round_over` game nobody readies up **does not freeze the table.** `ROUND_OVER_TIMEOUT_MS` (90s, in `shared`) after entering the state — persisted as the `Game.roundOverAt` column, not an in-memory timer, so it survives a server restart — a gateway `@Interval` sweep (`sweepRoundOverTimeouts`, ~10s resolution) **auto-forfeits every player who never readied** and advances through the *same* `withGameLock`/`advanceRound` path as a normal ready-up. It resolves on **readiness, not presence** — a watcher who never clicked ready is forfeited exactly like a closed tab.

The initial lobby start (`startGame`, `waiting → playing`) still requires the host and all-players-ready. `winnerId` is now `winnerPlayerId` (a real FK to `Player`, `onDelete: SET NULL`). `updateGameStats` fires on `→ finished` (ordered by `userId` ASC to avoid deadlocks), so `gamesPlayed`/`gamesWon` actually move.

### Redis

Used for the Socket.IO Redis adapter in `main.ts` (multi-instance broadcast; falls back to the default adapter if the connection fails) and for the readiness health check. The adapter is load-bearing beyond plain broadcast — presence (`fetchSockets`) and the round-over sweep (`this.server.to(...)`) both span instances through it, so without it they'd see only the local node. `RedisService`'s `get`/`set`/`del` helpers are not used for game state — Postgres is the only store.

### Client state layering

- `authStore` (Zustand + `persist`) holds the user; the JWT lives in `localStorage` under `token` and is read directly by `api.service.ts` and the socket connect path. `api.service.ts` throws a typed `ApiError` (`status`/`body`/`code`); `authStore` clears the token on a 401.
- `gameStore` subscribes to `authStore` *outside React* (bottom of `gameStore.ts`) to connect/disconnect the socket on login/logout. This only runs because `main.tsx` imports `@stores/gameStore` for its side effect — don't drop that import.
- React Query owns lobby lists (`hooks/queries/useGamesQuery.ts`, keys under `gameKeys`); `gameStore` invalidates `gameKeys.all` when leaving a game. `useGames` is a convenience wrapper over the two queries.
- `AuthContext` is a thin provider that just calls `fetchUserProfile()` on mount — the store is the real source of truth.

## Conventions

Contribution conventions — comments (with the full rationale and examples), commits, testing, docs,
and branch naming — are canonical in [`CONTRIBUTING.md`](./CONTRIBUTING.md) (committed). What follows
is only the codebase-specific facts an agent needs while working in this repo.

### Other

- **The rules and shared types live in `@blurtz/shared` — import them from there.** `SOCKET_EVENTS`, the card/game types, `GAME_CONSTANTS`, `PILE_RULES`, and the rules engine were previously hand-copied into both packages and had drifted; they are now single-sourced. `client/src/utils/constants.utils.ts` and the client's duplicate placement rules are gone. `client/src/utils/game.utils.ts` keeps only non-rule helpers (`getGameStatusTitle`, `getStatusColor`, `formatDate`). One stale spot remains: `API_ENDPOINTS` should not be trusted for game routes — the real paths are in `game.controller.ts` (`/api/game/listings`, `/api/game/active`, `/api/game/joinById`, `/api/game/joinByCode`) and `client/src/services/game.service.ts` hardcodes them.
- **Path aliases are declared in multiple places.** Client: `client/tsconfig.json`, `client/vite.config.ts`, `client/vitest.config.ts`. Server: `server/tsconfig.json` and the `jest.moduleNameMapper` block in `server/package.json`. Adding or renaming an alias means editing all of them. `@blurtz/shared` is **not** an alias — it resolves through the workspace symlink — so don't add one.
- **Strictness differs.** The client is `strict: true` with `noUnusedLocals`/`noUnusedParameters`; the server runs `strict: false`, `strictNullChecks: false`, `noImplicitAny: false`. Because the server has `strictNullChecks: false`, TypeScript won't narrow a discriminated union by boolean truthiness — server code uses `result.ok === false`, not `!result.ok`, deliberately.
- **Terminology.** `blurtz` pile = the Nertz pile (10 cards, only the top playable), `work` piles = tableau, `bank` piles = shared foundations, `draw` pile = stock (flips 3 at a time). Legacy names survive in a few places: socket events still say `call_blitz`/`blitz_called`, and a migration renamed `dutch_pile_count` → `bank_pile_count`. The DB and types use `bank`.
- **REST responses** are wrapped in `ApiResponse` (`{ success, data?, message?, error? }`) on success. Failures are **not** flattened to HTTP 200 — controllers let `GameService`/`AuthService` throw real Nest exceptions (`NotFoundException`, `BadRequestException`, `ForbiddenException`), so the status code carries the failure and the client's `ApiError` can read it.
- Cards carry `color.type` (`"a"` for red/blue, `"b"` for yellow/green) — that's what work-pile alternation checks, not the color name (bank piles match on `color.name`). A card's face value is `value` only; the old `number` alias and the unused `ownerId` were removed.
