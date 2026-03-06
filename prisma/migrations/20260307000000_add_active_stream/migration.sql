-- CreateTable
CREATE TABLE "ActiveStream" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "userLogin" TEXT     NOT NULL,
    "userName"  TEXT     NOT NULL,
    "startedAt" TEXT     NOT NULL,
    "seenAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
