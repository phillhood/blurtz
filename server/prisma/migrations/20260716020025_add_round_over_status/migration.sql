-- Add the `round_over` status, and NOTHING else.
--
-- This migration is deliberately alone, and must stay that way. Postgres lets
-- `ALTER TYPE ... ADD VALUE` run inside a transaction, but it will NOT let the
-- new value be USED by any statement in that same transaction:
--
--   ERROR: unsafe use of new value "round_over" of enum type "GameStatus"
--
-- Prisma wraps each migration in exactly one transaction. So the moment
-- anything that reads or writes 'round_over' (a DEFAULT, a backfill, a CHECK)
-- shares this file, `migrate deploy` fails on a fresh database. The value has
-- to be committed by its own migration before a later one may name it.
--
-- `starting` and `paused` are kept on purpose. Neither is reachable today, but
-- removing a Postgres enum value means rebuilding the whole type and rewriting
-- every column that uses it - and `starting` has a real use ahead of it as a
-- countdown before the deal.

-- AlterEnum
ALTER TYPE "GameStatus" ADD VALUE 'round_over';
