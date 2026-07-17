-- AlterTable
ALTER TABLE "games" ADD COLUMN     "round_over_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "games_status_round_over_at_idx" ON "games"("status", "round_over_at");
