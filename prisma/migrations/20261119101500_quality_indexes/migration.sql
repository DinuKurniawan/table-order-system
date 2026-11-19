-- Percepat agregasi verifikasi kasir pada dashboard (filter verifiedAt harian).
CREATE INDEX "Payment_verifiedAt_idx" ON "Payment"("verifiedAt");
