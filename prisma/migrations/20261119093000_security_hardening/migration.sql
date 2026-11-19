-- AlterTable: kunci idempotensi checkout (anti replay)
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

-- CreateTable: rate limit terdistribusi lintas instance
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
