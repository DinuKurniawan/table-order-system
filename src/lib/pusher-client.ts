/**
 * Pusher client singleton for browser-side realtime subscriptions.
 * 
 * Arsitektur:
 * - Singleton pusher-js dengan authEndpoint ke /api/pusher/auth
 * - Hook kustom: usePusherChannel(channelName) → { client, subscription, connectionStatus }
 * - Hook kustom: useRealtimeEvent(channel, event, handler) → unsubscribe fn
 * - Connection status menampilkan di ConnectionIndicator di layout
 * - Saat state kembali "connected", klien invalidasi TanStack Query
 */

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import { useQueryClient } from "@tanstack/react-query";
import { formatWIB, relativeTime } from "./utils";
import { logger } from "./logger";
import { env } from "@/lib/env";

// ============================================================
// Konfigurasi & Tipe
// ============================================================

const PUSHER_CLIENT_OPTS = {
  // Buat auth di server, jangan pakai authOptions bawaan
  authEndpoint: "/api/pusher/auth",
  cluster: env.PUSHER_CLUSTER,
};

// Tipe event yang didukung (sinkron dengan src/lib/realtime-events.ts)
type RealTimeEvent =
  | "order.created"
  | "payment.uploaded"
  | "order.status_changed"
  | "stock.changed"
  | "stock.low"
  | "transaction.created"
  | "kpi.updated"
  | "user.deactivated";

interface SubscriptionMeta {
  channel: string;
  event: RealTimeEvent;
}

// ============================================================
// Singleton Pusher client (per browser tab)
 // ============================================================

let pusherClientRef: Pusher | null = null;

/**
 * Mendapatkan Pusher client singleton.
 * Setiap tab browser mendapat client sendiri (karena auth req per-tab).
 */
export function getPusherClient(): Pusher | null {
  return pusherClientRef;
}

/**
 * Inisialisasi Pusher client di mounted komponen.
 * Simpan referensi ke global agar bisa dibagikan antar hook.
 */
export function initPusherClient(): Pusher | null {
  if (typeof window === "undefined") return null;

  // Hapus ref lama agar hanya ada 1 instance
  pusherClientRef = new Pusher(env.PUSHER_KEY, {
    ...PUSHER_CLIENT_OPTS,
    // Ambil token dari endpoint server
    // clientEvents: true, // kita hanya butuh server->client events
  });

  return pusherClientRef;
}

// ============================================================
// Hook: usePusherChannel
// ============================================================

/**
 * Hook untuk subscribe ke channel Pusher.
 * Mengembalikan:
 * - client: Pusher instance (untuk cleanup)
 * - subscription: Pusher Channel object (untuk subscribe event)
 * - connectionStatus: "connected" | "connecting" | "unavailable"
 * - autoInvalidate: apakah queryClient.invalidateQueries sudah dipanggil
 */
export function usePusherChannel(
  channelName: string
): {
  client: Pusher | null;
  subscription: import("pusher-js").Channel | null;
  connectionStatus: "connected" | "connecting" | "unavailable";
  autoInvalidate: () => void;
} {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "unavailable"
  >("unavailable");
  const ref = useRef({ unsubscribe: undefined as any });

  useEffect(() => {
    // Inisialisasi client jika belum ada
    if (!pusherClientRef) {
      initPusherClient();
    }

    const client = pusherClientRef!;
    const channel = client.subscribe(channelName);

    // Track connection state
    channel.bind("pusher:connection", (status: string) => {
      logger.debug(`Pusher connection status for ${channelName}: ${status}`);
      setConnectionStatus(
        status === "connected" ? "connected" : "connecting"
      );
    });

    channel.bind("pusher:error", (err: Error) => {
      logger.error(`Pusher error for ${channelName}:`, err);
      setConnectionStatus("unavailable");
    });

    // Simpan cleanup ref
    ref.current = {
      unsubscribe: () => {
        client.unsubscribe(channelName);
        setConnectionStatus("unavailable");
      },
    };

    // Auto-invalidate queries ketika connection return ke connected
    channel.bind("pusher:connection_established", () => {
      const currentStatus = connectionStatus;
      setConnectionStatus("connected");
      // Hanya invalidate jika status sebelumnya bukan connected
      // (hindari infinite invalidate)
      if (currentStatus !== "connected") {
        queryClient.invalidateQueries();
      }
    });

    return () => {
      if (ref.current?.unsubscribe) {
        ref.current.unsubscribe();
      }
    };
  }, [channelName, queryClient]);

  return {
    client: pusherClientRef,
    subscription: null, // akan dialihkan ke hook useRealtimeEvent
    connectionStatus,
    autoInvalidate: () => queryClient.invalidateQueries(),
  };
}

// ============================================================
// Hook: useRealtimeEvent
// ============================================================

/**
 * Hook untuk mendaftarkan handler pada event spesifik di channel.
 * 
 * @param channelName Nama channel
 * @param event Nama event
 * @param handler Fungsi handler yang dipanggil saat event terima
 * @param onDeactivatedOpsopsional: dipanggil ketika event "user.deactivated" diterima (untuk logout otomatis kasir)
 * @returns Fungsi cleanup
 */
export function useRealtimeEvent(
  channelName: string,
  event: RealTimeEvent,
  handler: (payload: unknown) => void,
  onDeactivated?: () => void
): () => void {
  const ref = useRef<(payload: unknown) => void>(undefined as any);

  ref.current = handler;

  useEffect(() => {
    const client = pusherClientRef;
    if (!client) return;

    const channel = client.subscribe(channelName);

    channel.bind(event, (data: unknown) => {
      const handler = ref.current;
      if (handler) {
        handler(data);
        // Jika event user.deactivated dan ada callback onDeactivated, panggilnya
        if (event === "user.deactivated" && onDeactivated) {
          onDeactivated();
        }
      }
    });

    return () => {
      if (ref.current !== undefined) {
        // No explicit unbind needed; channel cleanup happens on unmount
      }
    };
  }, [channelName, event, JSON.stringify(ref.current), onDeactivated]);

  return () => {
    // Cleanup: unsubscribe channel
    if (pusherClientRef) {
      pusherClientRef.unsubscribe(channelName);
    }
  };
}

// ============================================================
// Helper: convert Pusher timestamp to WIB relative
// ============================================================

/**
 * Mengubah timestamp dari Pusher ke format WIB yang dibaca manusia.
 */
export function pusherTimestampToWIB(
  timestamp: string | number | Date
): string {
  const d = typeof timestamp === "string" || typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  if (isNaN(d.getTime())) return "-";
  return relativeTime(d);
}

// ============================================================
// Export types
// ============================================================

export type { RealTimeEvent, SubscriptionMeta };