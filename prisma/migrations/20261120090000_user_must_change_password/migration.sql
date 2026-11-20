-- SEC-01: wajib ganti password setelah login pertama (seed admin).
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
