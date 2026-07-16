-- Drop game_snapshots. LAST of the four, on purpose.
--
-- It goes last because `round_results` is what replaces it, and a migration
-- that removed the old store before the new one existed would leave any
-- database mid-deploy with neither.
--
-- What is being dropped: a table `createSnapshot` wrote exactly one row into,
-- at game start, containing the entire game state as a JSON blob. Nothing ever
-- read it back. The REST routes that exposed it were deleted earlier as an
-- unscoped leak (any logged-in user could read any game's snapshot, face-down
-- cards and all), and no replay, undo or audit feature was ever built on it.
--
-- `round_results` is the deliberate opposite: not a state dump, but the three
-- numbers a round's score is made of, indexed for the scoreboard query the
-- client actually needs. The blob answered no question; the inputs answer the
-- only one anybody asks - "why is my score that?"

-- DropForeignKey
ALTER TABLE "game_snapshots" DROP CONSTRAINT "game_snapshots_game_id_fkey";

-- DropTable
DROP TABLE "game_snapshots";
