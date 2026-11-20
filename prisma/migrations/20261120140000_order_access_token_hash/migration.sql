-- SEC-09 EXPAND: hash token akses; plaintext lama tetap ada sampai backfill.
ALTER TABLE "Order" ALTER COLUMN "accessToken" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "accessTokenHash" TEXT;
