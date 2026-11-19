"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Coffee,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/stat-card";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { useRealtimeEvent } from "@/lib/pusher-client";
import { cn, formatRupiah, relativeTime } from "@/lib/utils";
import type {
  DashboardData,
  DashboardRange,
} from "@/server/services/dashboard";

const SalesChart = dynamic(
  () => import("@/components/admin/sales-chart").then((mod) => mod.SalesChart),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[400px] flex-1" />,
  }
);

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: "today", label: "Hari Ini" },
  { value: "week", label: "7 Hari" },
  { value: "month", label: "Bulan Ini" },
  { value: "year", label: "Tahun Ini" },
];

type SeriesKey = "pemasukan" | "pengeluaran" | "pesanan";

const SERIES_OPTIONS: Array<{
  key: SeriesKey;
  label: string;
  color: string;
  axis: "money" | "orders";
}> = [
  { key: "pemasukan", label: "Pemasukan", color: "#0E8F66", axis: "money" },
  { key: "pengeluaran", label: "Pengeluaran", color: "#F59A2B", axis: "money" },
  { key: "pesanan", label: "Pesanan", color: "#4B2FE0", axis: "orders" },
];

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, "Gagal memuat ringkasan"));
  return json.data as T;
}

function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);

  React.useEffect(() => {
    const from = fromRef.current;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-surface-muted/70", className)}
    />
  );
}

function SectionError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-border bg-surface-muted/40 p-6 text-center">
      <AlertTriangle className="size-5 text-accent-orange" />
      <p className="text-xs font-medium text-text-muted">
        Gagal memuat {label}.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

function ProfileCard({
  profile,
  pesanan,
  pendapatan,
  loading,
}: {
  profile: DashboardData["profile"] | null;
  pesanan: number;
  pendapatan: number;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-44" />;

  const name = profile?.name ?? "Admin";
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="rounded-full bg-[conic-gradient(from_180deg,#4B2FE0,#45A5F5,#1FC58E,#4B2FE0)] p-[3px]">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary-50 text-lg font-extrabold text-primary-800">
              {initials || "A"}
            </div>
          </div>
          <span className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-surface bg-accent-green" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-text-strong">{name}</p>
          <PillBadge variant="primary" className="mt-1">
            {profile?.role ?? "Super Admin"}
          </PillBadge>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Pesanan
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-text-strong">
            {Math.round(pesanan)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Pendapatan
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">
            {formatRupiah(Math.round(pendapatan))}
          </p>
        </div>
      </div>
    </div>
  );
}

function Donut({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative size-20">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#EDEDF3"
            strokeWidth="7"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-text-strong">
          {value}%
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-text-muted">{label}</p>
    </div>
  );
}

function ActivityIcon({ action }: { action: string }) {
  if (action.startsWith("payment")) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E3F8F1] text-[#0E8F66]">
        <CheckCircle2 className="size-4" />
      </span>
    );
  }
  if (action.startsWith("stock")) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FEF1DF] text-[#B26A0C]">
        <Boxes className="size-4" />
      </span>
    );
  }
  if (action.startsWith("transaction")) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-800">
        <Wallet className="size-4" />
      </span>
    );
  }
  if (action.startsWith("order")) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E4F2FE] text-[#1E7BD0]">
        <ShoppingBag className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-muted">
      <Clock className="size-4" />
    </span>
  );
}

export function DashboardManager() {
  const queryClient = useQueryClient();
  const [range, setRange] = React.useState<DashboardRange>("month");
  const [visible, setVisible] = React.useState<Record<SeriesKey, boolean>>({
    pemasukan: true,
    pengeluaran: true,
    pesanan: true,
  });
  const feedRef = React.useRef<HTMLDivElement>(null);
  const invalidateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const query = useQuery({
    queryKey: ["admin-dashboard", range],
    queryFn: () => api<DashboardData>(`/api/admin/dashboard?range=${range}`),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const invalidate = React.useCallback(() => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }, 500);
  }, [queryClient]);

  React.useEffect(() => {
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    };
  }, []);

  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.orderCreated, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.orderStatusChanged, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.stockLow, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.transactionCreated, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.kpiUpdated, invalidate);

  const data = query.data;
  const errors = data?.errors ?? {};
  const loading = query.isLoading;

  const pesanan = useCountUp(data?.kpi?.pesananHariIni ?? 0);
  const pendapatan = useCountUp(data?.kpi?.pendapatanHariIni ?? 0);
  const menunggu = useCountUp(data?.kpi?.menungguVerifikasi ?? 0);
  const stokMenipis = useCountUp(data?.kpi?.stokMenipis ?? 0);

  const kpiFailed = query.isError || errors.kpi;
  const seriesFailed = query.isError || errors.series;
  const compositionFailed = query.isError || errors.komposisi;
  const bestSellerFailed = query.isError || errors.menuTerlaris;
  const cashierFailed = query.isError || errors.kasirAktif;
  const tableFailed = query.isError || errors.mejaAktif;
  const activityFailed = query.isError || errors.aktivitas;

  const series = data?.series ?? [];
  const hasSeriesData = series.some(
    (point) => point.pemasukan || point.pengeluaran || point.pesanan
  );
  const composition = data?.komposisi ?? {
    makanan: 0,
    kopi: 0,
    nonKopi: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-text-muted">
          Kondisi kafe hari ini dan tren penjualan terkini.
        </p>
        <p className="text-xs text-text-muted">
          Diperbarui otomatis setiap ada pesanan atau transaksi baru.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-[20px]" />
          ))
        ) : (
          <>
            <StatCard
              title="Pesanan Hari Ini"
              value={kpiFailed ? "—" : String(Math.round(pesanan))}
              subtext={
                kpiFailed ? "Gagal memuat data" : "Total pesanan masuk hari ini"
              }
              icon={ShoppingBag}
              variant="indigo"
            />
            <StatCard
              title="Menunggu Verifikasi"
              value={kpiFailed ? "—" : String(Math.round(menunggu))}
              subtext={
                kpiFailed
                  ? "Gagal memuat data"
                  : "Perlu konfirmasi pembayaran"
              }
              icon={Clock}
              variant="blue"
            />
            <StatCard
              title="Pendapatan Hari Ini"
              value={kpiFailed ? "—" : formatRupiah(Math.round(pendapatan))}
              subtext={
                kpiFailed ? "Gagal memuat data" : "Pemasukan tercatat hari ini"
              }
              icon={TrendingUp}
              variant="green"
            />
            <StatCard
              title="Stok Menipis"
              value={kpiFailed ? "—" : String(Math.round(stokMenipis))}
              subtext={
                kpiFailed ? "Gagal memuat data" : "Produk di bawah ambang minimum"
              }
              icon={AlertTriangle}
              variant="lemon"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <ProfileCard
            profile={data?.profile ?? null}
            pesanan={pesanan}
            pendapatan={pendapatan}
            loading={loading}
          />

          <SectionCard
            title="Komposisi Kategori"
            subtitle="Proporsi item terjual"
          >
            {loading ? (
              <div className="flex justify-around">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="size-20 rounded-full" />
                ))}
              </div>
            ) : compositionFailed ? (
              <SectionError
                label="komposisi kategori"
                onRetry={() => query.refetch()}
              />
            ) : (
              <div className="flex items-start justify-around">
                <Donut
                  label="Makanan"
                  value={composition.makanan}
                  color="#F59A2B"
                />
                <Donut label="Kopi" value={composition.kopi} color="#4B2FE0" />
                <Donut
                  label="Non Kopi"
                  value={composition.nonKopi}
                  color="#45A5F5"
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Aktivitas Terbaru"
            subtitle="50 aktivitas terakhir"
            action={
              <Button
                variant="outline"
                size="icon-sm"
                title="Gulir ke aktivitas terlama"
                onClick={() =>
                  feedRef.current?.scrollTo({
                    top: feedRef.current.scrollHeight,
                    behavior: "smooth",
                  })
                }
              >
                <ArrowDown className="size-3.5" />
              </Button>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2.5 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityFailed ? (
              <SectionError
                label="aktivitas terbaru"
                onRetry={() => query.refetch()}
              />
            ) : (data?.aktivitasTerbaru?.length ?? 0) === 0 ? (
              <EmptyState
                title="Belum ada aktivitas"
                description="Aktivitas pesanan dan perubahan data akan muncul di sini."
              />
            ) : (
              <div
                ref={feedRef}
                className="max-h-[320px] space-y-1 overflow-y-auto pr-1"
              >
                {data?.aktivitasTerbaru?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-surface-muted/60"
                  >
                    <ActivityIcon action={item.action} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug text-text-strong">
                        {item.text}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {item.actor} · {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard
            title="Statistik Penjualan"
            subtitle="Pemasukan, pengeluaran, dan jumlah pesanan"
            className="flex h-full flex-col"
            contentClassName="flex flex-1 flex-col"
            action={
              <select
                value={range}
                onChange={(event) =>
                  setRange(event.target.value as DashboardRange)
                }
                className="h-8 rounded-xl border border-border bg-surface px-2.5 text-xs font-semibold text-text-strong"
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {SERIES_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    setVisible((current) => ({
                      ...current,
                      [option.key]: !current[option.key],
                    }))
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    visible[option.key]
                      ? "border-border bg-surface text-text-strong"
                      : "border-border/60 bg-surface-muted/50 text-text-muted"
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: visible[option.key]
                        ? option.color
                        : "#C9C9D4",
                    }}
                  />
                  {option.label}
                </button>
              ))}
            </div>

            {loading ? (
              <Skeleton className="min-h-[400px] flex-1" />
            ) : seriesFailed ? (
              <SectionError
                label="statistik penjualan"
                onRetry={() => query.refetch()}
              />
            ) : !hasSeriesData ? (
              <EmptyState
                icon={TrendingUp}
                title="Belum ada transaksi"
                description="Grafik akan terisi setelah ada pesanan atau transaksi pada periode ini."
                className="min-h-[400px] flex-1"
              />
            ) : (
              <div className="min-h-[400px] flex-1 w-full">
                <SalesChart
                  data={series}
                  granularity={data?.granularity ?? "day"}
                  visible={visible}
                />
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <SectionCard
          title="Menu Terlaris"
          subtitle="Top 10 berdasarkan jumlah terjual"
          className="xl:col-span-3"
        >
          {loading ? (
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-52 min-w-[170px]" />
              ))}
            </div>
          ) : bestSellerFailed ? (
            <SectionError
              label="menu terlaris"
              onRetry={() => query.refetch()}
            />
          ) : (data?.menuTerlaris?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Coffee}
              title="Belum ada penjualan"
              description="Menu terlaris muncul setelah ada pesanan pada periode ini."
            />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {data?.menuTerlaris?.map((item, index) => (
                <div
                  key={item.productId}
                  className="min-w-[170px] max-w-[190px] flex-1 rounded-[16px] border border-border bg-surface p-3"
                >
                  <div className="relative h-24 overflow-hidden rounded-xl bg-surface-muted">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.produk}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-primary-50 text-primary-600">
                        <Coffee className="size-7" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-primary-800 shadow-sm">
                      #{index + 1}
                    </span>
                  </div>
                  <p className="mt-2.5 truncate text-sm font-semibold text-text-strong">
                    {item.produk}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {item.qty} terjual
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                    {formatRupiah(item.omzet)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Kasir & Meja Aktif"
          subtitle="Verifikasi hari ini dan pesanan berjalan"
          className="xl:col-span-2"
        >
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  Kasir Aktif
                </p>
                <Link
                  href="/admin/cashiers"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  Lihat Semua
                  <ArrowRight className="size-3" />
                </Link>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-12" />
                  ))}
                </div>
              ) : cashierFailed ? (
                <SectionError
                  label="data kasir"
                  onRetry={() => query.refetch()}
                />
              ) : (data?.kasirAktif?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-text-muted">
                  Belum ada kasir aktif.
                </p>
              ) : (
                <div className="space-y-2">
                  {data?.kasirAktif?.map((cashier) => {
                    const online = Boolean(cashier.lastLogin);
                    return (
                      <div
                        key={cashier.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              online ? "bg-accent-green" : "bg-text-muted/40"
                            )}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-text-strong">
                              {cashier.kasir}
                            </p>
                            <p className="text-[10px] text-text-muted">
                              {cashier.lastLogin
                                ? `Login ${relativeTime(cashier.lastLogin)}`
                                : "Belum pernah login"}
                            </p>
                          </div>
                        </div>
                        <PillBadge variant="success" className="shrink-0">
                          {cashier.jumlahVerifikasi} verifikasi
                        </PillBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  Meja Aktif
                </p>
                <Link
                  href="/admin/tables"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  Lihat Semua
                  <ArrowRight className="size-3" />
                </Link>
              </div>
              {loading ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-20" />
                  ))}
                </div>
              ) : tableFailed ? (
                <SectionError
                  label="data meja"
                  onRetry={() => query.refetch()}
                />
              ) : (data?.mejaAktif?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-text-muted">
                  Tidak ada meja dengan pesanan berjalan.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data?.mejaAktif?.map((table) => (
                    <div
                      key={table.id}
                      className="rounded-xl border border-primary-200/60 bg-primary-50/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-primary-800">
                          {table.name}
                        </p>
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                          <span className="size-1.5 rounded-full bg-accent-green" />
                          aktif
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">
                        {table.orderCode} · {table.area ?? "Area umum"}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs font-semibold tabular-nums text-text-strong">
                          {formatRupiah(table.total)}
                        </p>
                        <span className="text-[10px] text-text-muted">
                          {relativeTime(table.since)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
