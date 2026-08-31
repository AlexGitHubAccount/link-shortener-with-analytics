-- DropIndex
DROP INDEX "Link_userId_idx";

-- CreateIndex
CREATE INDEX "Link_userId_createdAt_idx" ON "Link"("userId", "createdAt");
