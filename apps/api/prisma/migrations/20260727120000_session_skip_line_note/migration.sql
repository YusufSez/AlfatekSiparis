-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "SessionSkip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionSkip_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrderSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionSkip_sessionId_userId_key" ON "SessionSkip"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "SessionSkip_sessionId_idx" ON "SessionSkip"("sessionId");
