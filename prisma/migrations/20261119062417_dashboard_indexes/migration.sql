-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
