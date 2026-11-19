"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getPusherClient, useRealtimeEvent } from "@/lib/pusher-client";

/**
 * Sesi kasir diputus saat akun dinonaktifkan atau password direset:
 * event user.deactivated dikirim server setelah commit (audit T-04).
 */
export function CashierSessionGuard({ userId }: { userId: string }) {
  const router = useRouter();
  const ended = React.useRef(false);

  useRealtimeEvent(CHANNELS.user(userId), REALTIME_EVENTS.userDeactivated, () => {
    if (ended.current) return;
    ended.current = true;

    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      // Putuskan koneksi realtime agar tidak ada channel sensitif yang tersisa.
      getPusherClient()?.disconnect();
      router.replace("/login");
      router.refresh();
    });
  });

  return null;
}
