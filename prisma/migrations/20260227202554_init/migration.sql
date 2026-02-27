-- CreateTable
CREATE TABLE "StreamerProfile" (
    "userLogin" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT,
    "discord" TEXT,
    "telegram" TEXT,
    "youtube" TEXT,
    "donate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
