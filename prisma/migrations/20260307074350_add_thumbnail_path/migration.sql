/*
  Warnings:

  - You are about to alter the column `userId` on the `Subscription` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- AlterTable
ALTER TABLE "StreamerProfile" ADD COLUMN "thumbnailPath" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" BIGINT NOT NULL,
    "streamerLogin" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Subscription" ("createdAt", "id", "streamerLogin", "userId") SELECT "createdAt", "id", "streamerLogin", "userId" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_streamerLogin_idx" ON "Subscription"("streamerLogin");
CREATE UNIQUE INDEX "Subscription_userId_streamerLogin_key" ON "Subscription"("userId", "streamerLogin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
