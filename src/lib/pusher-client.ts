"use client";

/**
 * Pusher client untuk langganan channel realtime.
 * Prinsip: event hanya sinyal; data selalu diambil ulang dari API.
 */

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import { useQueryClient } from "@tanstack/react-query";

export type RealTimeEvent =
  | "order.created"
  | "payment.uploaded"
  | "order.status_changed"
  | "stock.changed"
  | "stock.low"
  | "transaction.created"
  | "kpi.updated"
  | "user.deactivated";

type ConnectionStatus = "connected" | "connecting" | "unavailable";

let pusherClient: Pusher | null = null;
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

export function initPusherClient(): Pusher | null {
  if (typeof window === "undefined") return null;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return null;

  if (!pusherClient) {
    pusherClient = new Pusher(key, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap1",
      authEndpoint: "/api/pusher/auth",
    });
  }

  return pusherClient;
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
    const client = initPusherClient();
    if (!client) return;

    const channel = retainChannel(client, channelName);
    const onSubscribed = () => setConnectionStatus("connected");
    const onFailed = () => setConnectionStatus("unavailable");

    channel.bind("pusher:subscription_succeeded", onSubscribed);
    channel.bind("pusher:subscription_error", onFailed);

    return () => {
      channel.unbind("pusher:subscription_succeeded", onSubscribed);
      channel.unbind("pusher:subscription_error", onFailed);
      releaseChannel(client, channelName);
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
    const client = initPusherClient();
    if (!client) return;

    const channel = retainChannel(client, channelName);
    const listener = (payload: unknown) => {
      handlerRef.current(payload);
      if (event === "user.deactivated") {
        deactivatedRef.current?.();
      }
    };

    channel.bind(event, listener);
    return () => {
      channel.unbind(event, listener);
      releaseChannel(client, channelName);
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
