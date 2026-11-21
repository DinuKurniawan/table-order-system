-- Status baca notifikasi admin, sinkron antar perangkat.
CREATE TABLE "NotificationRead" (
    "userId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId", "alertId")
);

ALTER TABLE "NotificationRead"
  ADD CONSTRAINT "NotificationRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
