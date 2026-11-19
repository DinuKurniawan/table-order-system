"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface AuditItem {
  id: string;
  action: string;
  text: string;
  entity: string;
  entityId: string;
  actor: { id: string; name: string; username: string } | null;
  createdAt: string;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: {
    actions: Array<{ value: string; label: string }>;
    users: Array<{ value: string; label: string }>;
  };
}

const PAGE_SIZE = 25;

function fmtWib(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionTone(action: string): string {
  if (action.startsWith("payment.approve") || action === "order.created") {
    return "bg-accent-green/10 text-accent-green";
  }
  if (action.includes("reject") || action.includes("delete") || action.includes("cancel")) {
    return "bg-accent-red/10 text-accent-red";
  }
  if (action.startsWith("stock.") || action.includes("expire")) {
    return "bg-accent-orange/10 text-accent-orange";
  }
  return "bg-primary-50 text-primary-700";
}

export function AuditManager() {
  const [userId, setUserId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);

  const changeFilter = (setter: (value: string) => void) => (
    event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    setter(event.target.value);
    setPage(1);
  };

  const query = useQuery({
    queryKey: ["admin-audit", userId, action, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (userId) params.set("userId", userId);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(apiErrorMessage(json, "Gagal memuat log audit"));
      }
      return (await res.json()).data as AuditResponse;
    },
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });

  const data = query.data;
  const dirty = Boolean(userId || action || from || to);

  const reset = () => {
    setUserId("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Log Audit"
        subtitle="Jejak perubahan penting: pesanan, pembayaran, stok, keuangan, kasir, dan pengaturan."
        action={
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            {data ? `${data.total.toLocaleString("id-ID")} entri` : "…"}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-medium text-text-muted">
            Pengguna
            <select
              value={userId}
              onChange={changeFilter(setUserId)}
              className="h-9 w-full rounded-xl border border-input bg-surface px-2.5 text-xs text-text-strong"
            >
              <option value="">Semua pengguna</option>
              {data?.filters.users.map((user) => (
                <option key={user.value} value={user.value}>
                  {user.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-text-muted">
            Aksi
            <select
              value={action}
              onChange={changeFilter(setAction)}
              className="h-9 w-full rounded-xl border border-input bg-surface px-2.5 text-xs text-text-strong"
            >
              <option value="">Semua aksi</option>
              {data?.filters.actions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-text-muted">
            Dari tanggal
            <input
              type="date"
              value={from}
              onChange={changeFilter(setFrom)}
              className="h-9 w-full rounded-xl border border-input bg-surface px-2.5 text-xs text-text-strong"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-text-muted">
            Sampai tanggal
            <input
              type="date"
              value={to}
              onChange={changeFilter(setTo)}
              className="h-9 w-full rounded-xl border border-input bg-surface px-2.5 text-xs text-text-strong"
            />
          </label>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={!dirty}
              className="h-9 w-full gap-2 rounded-xl text-xs"
            >
              <RotateCcw className="size-3.5" />
              Reset Filter
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Riwayat Aktivitas"
        subtitle="Terbaru di atas. Waktu ditampilkan dalam WIB."
        contentClassName="space-y-4"
      >
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-accent-red/40 bg-accent-red/5 p-8 text-center">
            <ShieldAlert className="size-8 text-accent-red" />
            <div>
              <p className="text-sm font-semibold text-text-strong">
                Gagal memuat log audit
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {query.error instanceof Error
                  ? query.error.message
                  : "Terjadi kesalahan"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Coba Lagi
            </Button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Tidak ada log"
            description="Belum ada aktivitas yang cocok dengan filter. Coba longgarkan rentang tanggal."
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-muted/60">
                    <TableHead className="text-xs">Waktu (WIB)</TableHead>
                    <TableHead className="text-xs">Pengguna</TableHead>
                    <TableHead className="text-xs">Aksi</TableHead>
                    <TableHead className="text-xs">Deskripsi</TableHead>
                    <TableHead className="text-xs">Entitas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-xs text-text-muted">
                        {fmtWib(item.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {item.actor ? (
                          <span>
                            <span className="font-medium text-text-strong">
                              {item.actor.name}
                            </span>
                            <span className="block text-[11px] text-text-muted">
                              @{item.actor.username}
                            </span>
                          </span>
                        ) : (
                          <span className="text-text-muted">Sistem / Publik</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold",
                            actionTone(item.action)
                          )}
                        >
                          {item.action}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[240px] text-xs text-text-strong">
                        {item.text}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[11px] text-text-muted">
                        {item.entity}
                        <span className="block font-mono text-[10px] opacity-70">
                          {item.entityId.slice(0, 12)}…
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                Halaman {data.page} dari {data.totalPages} · menampilkan{" "}
                {data.items.length} dari {data.total.toLocaleString("id-ID")} entri
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 rounded-xl text-xs"
                  disabled={data.page <= 1 || query.isFetching}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 rounded-xl text-xs"
                  disabled={data.page >= data.totalPages || query.isFetching}
                  onClick={() =>
                    setPage((value) => Math.min(data.totalPages, value + 1))
                  }
                >
                  Berikutnya
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
