-- CreateTable
CREATE TABLE "Subscription" (
    "id"            INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId"        INTEGER  NOT NULL,
    "streamerLogin" TEXT     NOT NULL,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_streamerLogin_key"
    ON "Subscription"("userId", "streamerLogin");

-- CreateIndex
CREATE INDEX "Subscription_streamerLogin_idx"
    ON "Subscription"("streamerLogin");
