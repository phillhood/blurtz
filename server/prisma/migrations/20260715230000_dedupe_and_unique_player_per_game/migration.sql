-- Deduplicate players BEFORE the unique index is created.
--
-- `joinGame` was check-then-create with no transaction, so two concurrent
-- joins by the same user could both pass the "already a player?" check and
-- create two Player rows for the same (user, game). `CREATE UNIQUE INDEX`
-- fails outright against such pre-existing duplicates, so any that exist must
-- be removed first. Keep the lowest id and drop the rest - the duplicate rows
-- are the artefact of the race, not a second seat at the table.
DELETE FROM players a USING players b
  WHERE a.user_id = b.user_id AND a.game_id = b.game_id AND a.id > b.id;

-- CreateIndex
CREATE INDEX "games_status_is_private_idx" ON "games"("status", "is_private");

-- CreateIndex
CREATE INDEX "games_host_id_idx" ON "games"("host_id");

-- CreateIndex
CREATE INDEX "players_game_id_idx" ON "players"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_game_id_key" ON "players"("user_id", "game_id");
