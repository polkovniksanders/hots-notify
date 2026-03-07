-- CreateTable
CREATE TABLE "ChannelSubscription" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "streamerLogin" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ChannelSubscription_streamerLogin_idx" ON "ChannelSubscription"("streamerLogin");
