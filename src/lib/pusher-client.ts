"use client";

/**
 * Pusher client untuk langganan channel realtime.
 * Prinsip: event hanya sinyal; data selalu diambil ulang dari API.
 */

import { useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import { useQueryClient } from "@tanstack/react-query";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { RealTimeEvent } from "@/lib/realtime-events";

export type { RealTimeEvent };

type ConnectionStatus = "connected" | "connecting" | "unavailable";

let pusherClient: Pusher | null = null;
let pusherPromise: Promise<Pusher | null> | null = null;
const channelRefs = new Map<string, number>();

function retainChannel(client: Pusher, channelName: string) {
  const count = channelRefs.get(channelName) ?? 0;
  channelRefs.set(channelName, count + 1);
  return client.subscribe(channelName);
}

function releaseChannel(client: Pusher, channelName: string): void {
  const count = channelRefs.get(channelName) ?? 0;
  if (count <= 1) {
    channelRefs.delete(channelName);
    client.unsubscribe(channelName);
  } else {
    channelRefs.set(channelName, count - 1);
  }
}

export function getPusherClient(): Pusher | null {
  return pusherClient;
}

/**
 * Muat pusher-js setelah paint/idle agar chunk realtime tidak berebut
 * bandwidth dengan gambar LCP di kunjungan pertama.
 */
export function initPusherClient(): Promise<Pusher | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return Promise.resolve(null);

  if (!pusherPromise) {
    pusherPromise = new Promise((resolve) => {
      const load = () => {
        import("pusher-js")
          .then(({ default: PusherClient }) => {
            if (!pusherClient) {
              pusherClient = new PusherClient(key, {
                cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap1",
                authEndpoint: "/api/pusher/auth",
              });
            }
            resolve(pusherClient);
          })
          .catch(() => {
            pusherPromise = null;
            resolve(null);
          });
      };

      if (window.requestIdleCallback) {
        // Jangan mulai sebelum gambar LCP selesai; stok tetap segar setelahnya.
        window.setTimeout(() => {
          window.requestIdleCallback(load, { timeout: 2000 });
        }, 1500);
      } else {
        window.setTimeout(load, 1500);
      }
    });
  }

  return pusherPromise;
}

export function usePusherChannel(channelName: string): {
  client: Pusher | null;
  subscription: import("pusher-js").Channel | null;
  connectionStatus: ConnectionStatus;
  autoInvalidate: () => void;
} {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    let channel: import("pusher-js").Channel | null = null;
    let onSubscribed: (() => void) | null = null;
    let onFailed: (() => void) | null = null;

    void initPusherClient().then((client) => {
      if (!client) {
        setConnectionStatus("unavailable");
        return;
      }
      if (cancelled) return;

      channel = retainChannel(client, channelName);
      onSubscribed = () => setConnectionStatus("connected");
      onFailed = () => setConnectionStatus("unavailable");

      channel.bind("pusher:subscription_succeeded", onSubscribed);
      channel.bind("pusher:subscription_error", onFailed);
    });

    return () => {
      cancelled = true;
      if (!channel) return;
      if (onSubscribed) channel.unbind("pusher:subscription_succeeded", onSubscribed);
      if (onFailed) channel.unbind("pusher:subscription_error", onFailed);
      const client = getPusherClient();
      if (client) releaseChannel(client, channelName);
    };
  }, [channelName]);

  return {
    client: pusherClient,
    subscription: null,
    connectionStatus,
    autoInvalidate: () => queryClient.invalidateQueries(),
  };
}

export function useRealtimeEvent(
  channelName: string,
  event: RealTimeEvent,
  handler: (payload: unknown) => void,
  onDeactivated?: () => void
): () => void {
  const handlerRef = useRef(handler);
  const deactivatedRef = useRef(onDeactivated);

  useEffect(() => {
    handlerRef.current = handler;
    deactivatedRef.current = onDeactivated;
  });

  useEffect(() => {
    let cancelled = false;
    let channel: import("pusher-js").Channel | null = null;
    let listener: ((payload: unknown) => void) | null = null;

    void initPusherClient().then((client) => {
      if (!client || cancelled) return;

      channel = retainChannel(client, channelName);
      listener = (payload: unknown) => {
        handlerRef.current(payload);
        if (event === REALTIME_EVENTS.userDeactivated) {
          deactivatedRef.current?.();
        }
      };

      channel.bind(event, listener);
    });

    return () => {
      cancelled = true;
      if (!channel) return;
      if (listener) channel.unbind(event, listener);
      const client = getPusherClient();
      if (client) releaseChannel(client, channelName);
    };
  }, [channelName, event]);

  return () => {
    // Cleanup ditangani oleh efek di atas (ref-counted).
  };
}

export function pusherTimestampToWIB(
  timestamp: string | number | Date
): string {
  const date =
    typeof timestamp === "string" || typeof timestamp === "number"
      ? new Date(timestamp)
      : timestamp;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}
