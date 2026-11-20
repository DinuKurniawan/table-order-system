-- Percepat lookup meja aktif + dashboard dan cron kedaluwarsa.
CREATE INDEX "Order_tableId_status_createdAt_idx" ON "Order"("tableId", "status", "createdAt");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- Percepat rekap verifikasi pembayaran per kasir.
CREATE INDEX "Payment_verifiedById_verifiedAt_idx" ON "Payment"("verifiedById", "verifiedAt");
