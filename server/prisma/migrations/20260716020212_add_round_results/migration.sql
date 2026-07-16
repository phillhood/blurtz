-- The per-round scoreboard: scoring INPUTS, one row per player per round.
--
-- Third of four, and it has to come after add_multi_round_columns: the
-- player_id FK below points at "players", and the round this table records is
-- the one "games"."current_round" counts.
--
-- The (game_id, player_id, round) unique is not decoration. callBlitz writes
-- one of these per player inside the game lock; if a second caller ever got
-- past that lock, this constraint is the last thing standing between a
-- double-scored round and a corrupt scoreboard.

-- CreateTable
CREATE TABLE "round_results" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "bank_pile_count" INTEGER NOT NULL,
    "blurtz_remaining" INTEGER NOT NULL,
    "round_score" INTEGER NOT NULL,
    "cumulative_score" INTEGER NOT NULL,
    "called_blurtz" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "round_results_game_id_round_idx" ON "round_results"("game_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "round_results_game_id_player_id_round_key" ON "round_results"("game_id", "player_id", "round");

-- AddForeignKey
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
