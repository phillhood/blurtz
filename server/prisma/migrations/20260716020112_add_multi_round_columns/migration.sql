-- Multi-round columns, and the winner FK.
--
-- Ordering: this MUST come after `add_round_over_status`. Nothing here names
-- 'round_over', but the next migrations do, and keeping the enum change alone
-- in its own transaction is what makes any of them deployable at all.

-- Rounds and the target to play to.
--
-- `current_round` is 1-BASED. A game is "in round 1" from the moment it is
-- created until the first Blitz, so there is no round 0 for a row to sit in
-- and no off-by-one between the number stored and the number a player is told
-- they are playing. Existing rows adopt the default, which is correct for
-- them: every game that predates this migration played exactly one round.
ALTER TABLE "games" ADD COLUMN "current_round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "games" ADD COLUMN "target_score" INTEGER NOT NULL DEFAULT 100;

-- This round's score, beside the now-cumulative `score`.
ALTER TABLE "players" ADD COLUMN "round_score" INTEGER NOT NULL DEFAULT 0;

-- winner_id -> winner_player_id: a RENAME, not the drop-and-add Prisma
-- generates for a renamed field. The column already holds a Player.id - it
-- just never said so and had no constraint to prove it - so the data is
-- exactly what the new column wants and dropping it would throw away every
-- finished game's winner for nothing.
ALTER TABLE "games" RENAME COLUMN "winner_id" TO "winner_player_id";

-- Orphans have to go before the constraint does on.
--
-- `winner_id` was an unconstrained TEXT column for its whole life, and players
-- are deleted on leave and forfeit, so nothing ever stopped it pointing at a
-- player row that no longer exists. `ADD CONSTRAINT ... FOREIGN KEY` validates
-- every existing row and fails outright on the first orphan it finds, which
-- would break `migrate deploy` against any database that has one. Null them:
-- a dangling id is not a winner, it is a fact the database already lost.
UPDATE "games" SET "winner_player_id" = NULL
  WHERE "winner_player_id" IS NOT NULL
    AND "winner_player_id" NOT IN (SELECT "id" FROM "players");

-- ON DELETE SET NULL, deliberately.
--
-- Players are deleted routinely - every leave and every forfeit - and a game
-- row must survive its winner disappearing. The alternatives both break
-- something real:
--   * CASCADE would delete the GAME when the winning player is deleted.
--   * RESTRICT/NO ACTION would refuse to delete the player at all, and would
--     deadlock the existing Game -> Player cascade: deleting a game deletes
--     its players, and those players are what this column points at.
-- SET NULL is also what makes the Game -> Player cascade terminate: the game
-- being deleted is nulled on its way out, and the delete proceeds.
ALTER TABLE "games" ADD CONSTRAINT "games_winner_player_id_fkey"
  FOREIGN KEY ("winner_player_id") REFERENCES "players"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
