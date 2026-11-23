-- QRIS dinamis tanpa gateway: payload statis disimpan di metode bayar,
-- bukti bayar menjadi opsional (klaim QRIS tidak mengunggah bukti).
ALTER TABLE "PaymentMethod" ADD COLUMN "qrisPayload" TEXT;

ALTER TABLE "Payment" ADD COLUMN "method" TEXT;
ALTER TABLE "Payment" ALTER COLUMN "proofKey" DROP NOT NULL;
