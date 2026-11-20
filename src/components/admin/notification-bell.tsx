"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Boxes, ClipboardCheck, type LucideIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { useRealtimeEvent } from "@/lib/pusher-client";
import { apiErrorMessage } from "@/lib/api-error";

interface AdminAlert {
  id: "awaiting-verification" | "low-stock";
  label: string;
  description: string;
  count: number;
  href: string;
}

interface NotificationsData {
  total: number;
  alerts: AdminAlert[];
}

const ALERT_ICONS: Record<AdminAlert["id"], LucideIcon> = {
  "awaiting-verification": ClipboardCheck,
  "low-stock": Boxes,
};

async function fetchNotifications(): Promise<NotificationsData> {
  const res = await fetch("/api/admin/notifications");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, "Gagal memuat notifikasi"));
  return json.data as NotificationsData;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const query = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: fetchNotifications,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  }, [queryClient]);

  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.orderCreated, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.paymentUploaded, invalidate);
  useRealtimeEvent(
    CHANNELS.admin,
    REALTIME_EVENTS.orderStatusChanged,
    invalidate
  );
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.stockChanged, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.stockLow, invalidate);

  const alerts = query.data?.alerts ?? [];
  const total = query.data?.total ?? 0;
  const badge = total > 99 ? "99+" : String(total);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative flex size-10 items-center justify-center rounded-full bg-surface text-text-muted hover:text-text-strong border border-border shadow-xs transition-colors outline-none cursor-pointer"
        aria-label={
          total > 0 ? `Notifikasi, ${total} belum ditangani` : "Notifikasi"
        }
      >
        <Bell className="size-4" />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white ring-2 ring-surface"
          >
            {badge}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 gap-0 rounded-2xl border-border bg-surface p-2 shadow-pop"
      >
        <div className="px-2 py-1.5 text-xs font-bold text-text-strong">
          Notifikasi
        </div>

        {query.isLoading ? (
          <p className="px-2 py-3 text-xs text-text-muted">Memuat…</p>
        ) : query.isError ? (
          <p className="px-2 py-3 text-xs text-text-muted">
            Gagal memuat notifikasi.
          </p>
        ) : alerts.length === 0 ? (
          <p className="px-2 py-3 text-xs text-text-muted">
            Tidak ada notifikasi.
          </p>
        ) : (
          <ul className="mt-0.5 space-y-0.5">
            {alerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.id] ?? Bell;
              return (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-muted"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-800">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-text-strong">
                          {alert.label}
                        </span>
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                          {alert.count > 99 ? "99+" : alert.count}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-text-muted">
                        {alert.description}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
