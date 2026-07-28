-- CreateTable
CREATE TABLE "SessionSpecialRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionSpecialRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrderSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionSpecialRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SessionSpecialRequest_sessionId_idx" ON "SessionSpecialRequest"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSpecialRequest_sessionId_userId_key" ON "SessionSpecialRequest"("sessionId", "userId");
