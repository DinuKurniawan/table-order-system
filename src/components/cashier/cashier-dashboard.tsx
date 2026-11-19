"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  ChevronRight,
  ClipboardList,
  Clock,
  CookingPot,
  History,
  Package,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import { cn, formatRupiah, relativeTime } from "@/lib/utils";
import { useRealtimeEvent } from "@/lib/pusher-client";
import {
  playCashierSound,
  setSoundEnabled,
  useSoundEnabled,
} from "@/lib/cashier-audio";
import type {
  CashierOrderListItem,
  CashierQueue,
} from "@/server/services/cashier-orders";

type TabKey = "verification" | "processing" | "ready" | "history";

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: LucideIcon;
  empty: string;
}> = [
  {
    key: "verification",
    label: "Perlu Verifikasi",
    icon: BellRing,
    empty: "Tidak ada bukti pembayaran yang menunggu verifikasi.",
  },
  {
    key: "processing",
    label: "Diproses",
    icon: CookingPot,
    empty: "Belum ada pesanan yang sedang diproses.",
  },
  {
    key: "ready",
    label: "Siap",
    icon: Package,
    empty: "Belum ada pesanan yang siap disajikan.",
  },
  {
    key: "history",
    label: "Riwayat",
    icon: History,
    empty: "Belum ada riwayat pesanan.",
  },
];

const STATUS_LABEL: Record<string, string> = {
  AWAITING_VERIFICATION: "Menunggu verifikasi",
  ACCEPTED: "Diterima",
  PREPARING: "Diproses",
  READY: "Siap",
  COMPLETED: "Selesai",
  PAYMENT_REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

const STATUS_CLASS: Record<string, string> = {
  AWAITING_VERIFICATION: "bg-accent-orange/15 text-accent-orange border-transparent",
  ACCEPTED: "bg-accent-blue/15 text-accent-blue border-transparent",
  PREPARING: "bg-primary-50 text-primary-800 border-primary-200",
  READY: "bg-accent-green/15 text-emerald-700 border-transparent",
  COMPLETED: "bg-surface-muted text-text-muted border-border",
  PAYMENT_REJECTED: "bg-destructive/10 text-destructive border-transparent",
  CANCELLED: "bg-surface-muted text-text-muted border-border",
};

async function fetchQueue(): Promise<CashierQueue> {
  const res = await fetch("/api/cashier/orders", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Gagal memuat antrean");
  return json.data as CashierQueue;
}

export function CashierDashboard() {
  const queryClient = useQueryClient();
  const soundEnabled = useSoundEnabled();
  const [tab, setTab] = React.useState<TabKey>("verification");
  const [highlighted, setHighlighted] = React.useState<Record<string, number>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["cashier-orders"],
    queryFn: fetchQueue,
    refetchInterval: 15_000,
  });

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
  }, [queryClient]);

  const highlight = React.useCallback((code: string) => {
    setHighlighted((prev) => ({ ...prev, [code]: Date.now() }));
    clearTimeout(timers.current[code]);
    timers.current[code] = setTimeout(() => {
      setHighlighted((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
    }, 8_000);
  }, []);

  React.useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  const notify = React.useCallback(
    (payload: unknown, prefix: string) => {
      const data = payload as
        | { orderCode?: string; tableName?: string }
        | null;
      const target = data?.tableName ?? data?.orderCode;
      toast.info(target ? `${prefix} ${target}` : prefix);
      playCashierSound();
      if (data?.orderCode) highlight(data.orderCode);
      refresh();
    },
    [highlight, refresh]
  );

  useRealtimeEvent("private-cashier", "order.created", (payload) =>
    notify(payload, "Pesanan baru dari")
  );
  useRealtimeEvent("private-cashier", "payment.uploaded", (payload) =>
    notify(payload, "Bukti bayar masuk dari")
  );
  useRealtimeEvent("private-cashier", "order.status_changed", refresh);
  useRealtimeEvent("private-cashier", "transaction.created", refresh);

  const verificationCount = data?.counts.verification ?? 0;
  React.useEffect(() => {
    document.title = verificationCount > 0 ? `(${verificationCount}) Kasir` : "Kasir";
    return () => {
      document.title = "Kasir";
    };
  }, [verificationCount]);

  const orders: CashierOrderListItem[] = data?.[tab] ?? [];
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-strong">
            Antrean Pesanan
          </h2>
          <p className="text-sm text-text-muted">
            Verifikasi bukti bayar dan kelola progres pesanan secara realtime.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Bell className="size-3.5" />
          Pembaruan otomatis aktif
        </div>
      </div>

      {!soundEnabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-accent-orange/30 bg-accent-orange/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-text-strong">
            <Volume2 className="size-4 text-accent-orange" />
            Suara notifikasi belum aktif. Aktifkan agar pesanan baru langsung terdengar.
          </p>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setSoundEnabled(true)}
          >
            <BellRing className="size-4" /> Aktifkan suara
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-[16px] border border-border bg-surface p-2 shadow-card">
        {TABS.map((item) => {
          const count = data?.counts[item.key] ?? 0;
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:bg-surface-muted hover:text-text-strong"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-primary-50 text-primary-800"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-[20px] border border-border bg-surface"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={activeTab.icon}
          title={`${activeTab.label} kosong`}
          description={activeTab.empty}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/cashier/orders/${order.id}`}
              className={cn(
                "group flex flex-col justify-between rounded-[20px] border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop",
                highlighted[order.code] &&
                  "ring-2 ring-primary/60 animate-pulse border-primary/40"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-base font-bold tracking-wide text-text-strong">
                    {order.code}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text">
                    {order.tableName}
                    {order.customerName ? ` · ${order.customerName}` : ""}
                  </p>
                </div>
                <Badge
                  className={cn("px-2.5 py-1 text-[11px]", STATUS_CLASS[order.status])}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div className="space-y-1 text-xs text-text-muted">
                  <p className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {relativeTime(order.createdAt)}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <ClipboardList className="size-3.5" />
                    {order.itemCount} item
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary-800">
                    {formatRupiah(order.total)}
                  </p>
                  <span className="inline-flex items-center text-xs font-medium text-text-muted group-hover:text-primary">
                    Buka <ChevronRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
