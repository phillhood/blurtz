-- CreateEnum
CREATE TYPE "CardSkin" AS ENUM ('solid', 'emissive');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "card_skin" "CardSkin" NOT NULL DEFAULT 'solid';
