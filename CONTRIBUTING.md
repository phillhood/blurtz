# Contributing to Blurtz

The committed, canonical home for the repo's conventions. Two things live elsewhere on purpose:
codebase architecture and agent-specific navigation are in `CLAUDE.md` (local, gitignored), and
active planning — phase plans, specs, handoffs — is in `.dev/` (local, gitignored).

## Branches

Type prefix + kebab slug. Cut from `main`, one PR back into `main`, delete after merge.

| Prefix   | For                                        | Example                  |
|----------|--------------------------------------------|--------------------------|
| `feat/`  | new feature or capability                  | `feat/frontend-rework`   |
| `fix/`   | bug fix                                     | `fix/join-by-code-race`  |
| `chore/` | tooling, deps, deployment, non-behavioural  | `chore/deploy-caddy`     |
| `docs/`  | docs / planning only                        | `docs/contributing`      |

One branch per unit of work; keep the slug short and specific.

## Commits

- **One line, lowercase, imperative** — say what the change does in plain language.
  `sweep the round-over deadline from the gateway`, not `Fix: round-over deadline`.
- **No type prefix in the subject.** The kind lives on the branch (`feat/`…), not the message — the
  two conventions don't mix.
- **No `Co-Authored-By` trailer and no "Generated with…" annotation.**
- A body is optional and rare; reach for one only when the *why* won't fit the subject.

House style, from the log: `time out a round_over game nobody readies up` ·
`derive presence from room membership and broadcast it` · `cover a real mid-game drop end to end`.

## Comments

**A comment exists only to state something the code cannot show itself** — an invariant, a
non-obvious "why", a trap. If the code already says it, don't write it.

```ts
// No. The code says this.
// Find the player in the game
const player = game.players.find((p) => p.id === playerId);

// Yes. The code cannot say this, and someone will "simplify" the lock away without it.
// The players row isn't covered by the games row lock - both must take it or
// they don't serialize.
```

- **No archaeology.** Never reference what the code used to be, a past bug, a commit sha, or a
  task/phase number. Git holds that; it's noise the moment the PR merges.
- **Trap warnings are allowed** — present tense, as a fact, without the war story. "Only the top card
  may go to a bank pile; a buried card would corrupt the foundation" — not "used to splice the whole
  stack, fixed in abc1234".
- **One or two lines. A paragraph is a smell** — usually the code or the name is wrong, or it belongs
  in a design doc. Rare exceptions for genuinely subtle invariants (the lock discipline, redaction's
  player-independence).
- **Tests follow the same rules. The test name is the documentation** — never preface a test with a
  comment restating it. Comment only a non-obvious fixture:
  `// Deliberately illegal: a buried card, to prove the guard rejects it.`
- **JSDoc only where the signature isn't enough.** `scoreRound(bankPileCount, blurtzRemaining)` needs
  none; a trap parameter (`dealCards`'s injectable `rng`) or a subtle contract (`toClientGameState`
  is player-*independent*) earns one — including in `shared/`, a real package surface.

## Testing

**Test-first, always.** Every change lands red → green → refactor: write the failing test, watch it
fail, then implement. No implementation merges without a test that failed before it — a test that
cannot fail is not a test. The existing gates stay green.

| Layer | Runner | Location |
|---|---|---|
| Rules engine + redaction | jest | `shared/**/*.spec.ts` (pure — no Prisma/Nest) |
| Server (service, gateway) | jest | `server/src/**/*.spec.ts` (colocated) |
| Client components / stores | vitest | `client/src/**/*.test.tsx` |
| End-to-end | Playwright | `client/e2e/*.spec.ts` |

- **Run it:** `npm test` from root (builds `shared`, then all three suites), or per package — see
  `CLAUDE.md` and the `Makefile`.
- **Coverage is gated at 70%** (client thresholds, enforced) — don't drop below it.
- **E2E uses role/label-based locators** so a restyle doesn't break behavioural tests. If a restyle
  breaks a test, check whether the test was over-specified before changing the design.
- The e2e `webServer` boots both API and client against the test DB, so it passes on a clean checkout.

## Documentation

| File / dir | Committed? | Holds | Update when |
|---|---|---|---|
| `README.md` | yes | what Blurtz is + how to run it | the stack or run steps change |
| `CONTRIBUTING.md` | yes | these conventions | a convention changes |
| `CLAUDE.md` | no (gitignored) | architecture deep-dive, codebase facts, agent traps | you change architecture it describes |
| `.dev/` | no (gitignored) | ephemeral planning: phase plans, specs, handoffs | per phase; not committed by design |

- **Keep `README` and `CONTRIBUTING` free of ephemeral state** (status, phase progress) — that lives
  in `.dev/`.
- **The v1 plan's four work areas are "phases"** (1–4). The remediation pass's Phases 0–7 are a
  separate, completed body of work — "phase" is scoped to a plan. Planning and status live in `.dev/`.
