"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  Download,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillBadge } from "@/components/admin/pill-badge";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatRupiah, formatWIB } from "@/lib/utils";
import { prepareImageUpload, putToPresignedUrl } from "@/lib/client-image";
import { useRealtimeEvent } from "@/lib/pusher-client";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type FinancePreset,
} from "@/lib/validators/finance";
import type {
  FinanceOverview,
  FinanceTransactionList,
  FinanceTransactionRow,
} from "@/server/services/finance";

const PRESETS: Array<{ key: FinancePreset; label: string }> = [
  { key: "today", label: "Hari Ini" },
  { key: "7d", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
  { key: "year", label: "Tahun Ini" },
  { key: "custom", label: "Kustom" },
];

const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

// Recharts berat: pisahkan dari bundle awal halaman keuangan.
const FinanceChart = dynamic(
  () => import("@/components/admin/finance-chart").then((mod) => mod.FinanceChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 animate-pulse rounded-xl bg-surface-muted/60" />
    ),
  }
);

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStartWib(): string {
  return `${todayWib().slice(0, 7)}-01`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, "Permintaan gagal"));
  return json.data as T;
}

export function FinanceManager() {
  const queryClient = useQueryClient();
  const [preset, setPreset] = React.useState<FinancePreset>("month");
  const [customFrom, setCustomFrom] = React.useState(monthStartWib);
  const [customTo, setCustomTo] = React.useState(todayWib);
  const [showIncome, setShowIncome] = React.useState(true);
  const [showExpense, setShowExpense] = React.useState(true);

  const [typeFilter, setTypeFilter] = React.useState<"all" | "INCOME" | "EXPENSE">("all");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [tableFrom, setTableFrom] = React.useState("");
  const [tableTo, setTableTo] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [dialog, setDialog] = React.useState<{
    type: "INCOME" | "EXPENSE";
    row?: FinanceTransactionRow;
  } | null>(null);

  const overviewParams = new URLSearchParams({ preset });
  if (preset === "custom") {
    overviewParams.set("from", customFrom);
    overviewParams.set("to", customTo);
  }

  const overview = useQuery({
    queryKey: ["finance-overview", preset, customFrom, customTo],
    queryFn: () => api<FinanceOverview>(`/api/admin/finance/overview?${overviewParams}`),
  });

  const listParams = new URLSearchParams({
    page: String(page),
    pageSize: "10",
    type: typeFilter,
  });
  if (categoryFilter) listParams.set("category", categoryFilter);
  if (tableFrom) listParams.set("from", tableFrom);
  if (tableTo) listParams.set("to", tableTo);

  const transactions = useQuery({
    queryKey: ["finance-transactions", page, typeFilter, categoryFilter, tableFrom, tableTo],
    queryFn: () =>
      api<FinanceTransactionList>(`/api/admin/finance/transactions?${listParams}`),
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
    queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
  }, [queryClient]);

  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.transactionCreated, invalidate);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.kpiUpdated, invalidate);

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/finance/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Transaksi dihapus");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Gagal menghapus"),
  });

  const summary = overview.data?.summary ?? { income: 0, expense: 0, net: 0, count: 0 };
  const series = overview.data?.series ?? [];
  const granularity = overview.data?.granularity ?? "day";
  const items = transactions.data?.items ?? [];
  const totalPages = transactions.data?.totalPages ?? 1;

  const exportCsv = async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "1000", type: typeFilter });
    if (categoryFilter) params.set("category", categoryFilter);
    if (tableFrom) params.set("from", tableFrom);
    if (tableTo) params.set("to", tableTo);

    try {
      const result = await api<FinanceTransactionList>(
        `/api/admin/finance/transactions?${params}`
      );
      if (result.items.length === 0) {
        toast.error("Tidak ada transaksi untuk diekspor");
        return;
      }
      const header = ["Tanggal", "Jenis", "Kategori", "Jumlah", "Catatan", "Pesanan", "Oleh"];
      const body = result.items.map((row) => [
        formatWIB(row.occurredAt),
        row.type === "INCOME" ? "Pemasukan" : "Pengeluaran",
        row.category,
        row.amount,
        row.note ?? "",
        row.orderCode ?? "",
        row.createdByName ?? "",
      ]);
      const csv = [header, ...body]
        .map((line) =>
          line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `keuangan-${tableFrom || "awal"}-${tableTo || "akhir"}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengekspor");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-strong">
            Laporan Keuangan
          </h2>
          <p className="text-sm text-text-muted">
            Arus kas, laba bersih, dan jurnal transaksi kafe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPreset(item.key)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                preset === item.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-text-muted hover:text-text-strong"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2 rounded-[16px] border border-border bg-surface p-3">
          <label className="space-y-1 text-xs font-medium text-text-muted">
            Dari
            <Input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="h-9"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-text-muted">
            Sampai
            <Input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="h-9"
            />
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total Pemasukan"
          value={summary.income}
          icon={TrendingUp}
          tone="green"
        />
        <SummaryCard
          label="Total Pengeluaran"
          value={summary.expense}
          icon={TrendingDown}
          tone="lemon"
        />
        <SummaryCard
          label="Laba Bersih"
          value={summary.net}
          icon={Wallet}
          tone="indigo"
        />
      </div>

      <SectionCard
        title="Arus Kas"
        subtitle={`${summary.count} transaksi pada rentang ini`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIncome((value) => !value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                showIncome
                  ? "border-accent-green/40 bg-accent-green/10 text-emerald-800"
                  : "border-border text-text-muted"
              )}
            >
              Pemasukan
            </button>
            <button
              type="button"
              onClick={() => setShowExpense((value) => !value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                showExpense
                  ? "border-accent-orange/40 bg-accent-orange/10 text-accent-orange"
                  : "border-border text-text-muted"
              )}
            >
              Pengeluaran
            </button>
          </div>
        }
      >
        {overview.isLoading ? (
          <div className="h-72 animate-pulse rounded-xl bg-surface-muted/60" />
        ) : series.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Belum ada data"
            description="Tidak ada transaksi pada rentang tanggal ini."
          />
        ) : (
          <div className="h-72 w-full">
            <FinanceChart
              series={series}
              granularity={granularity}
              showIncome={showIncome}
              showExpense={showExpense}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Jurnal Transaksi"
        subtitle="Transaksi penjualan otomatis terkunci; koreksi dilakukan lewat refund."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCsv}>
              <Download className="size-3.5" />
              Ekspor CSV
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setDialog({ type: "INCOME" })}
            >
              <Plus className="size-4" />
              Pemasukan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => setDialog({ type: "EXPENSE" })}
            >
              <Plus className="size-4" />
              Pengeluaran
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-text-muted">
              Jenis
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as typeof typeFilter);
                  setPage(1);
                }}
                className="block h-9 rounded-xl border border-border bg-surface px-3 text-sm text-text-strong"
              >
                <option value="all">Semua</option>
                <option value="INCOME">Pemasukan</option>
                <option value="EXPENSE">Pengeluaran</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-text-muted">
              Kategori
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setPage(1);
                }}
                className="block h-9 rounded-xl border border-border bg-surface px-3 text-sm text-text-strong"
              >
                <option value="">Semua kategori</option>
                {ALL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="Refund">Refund</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-text-muted">
              Dari
              <Input
                type="date"
                value={tableFrom}
                onChange={(event) => {
                  setTableFrom(event.target.value);
                  setPage(1);
                }}
                className="h-9"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-text-muted">
              Sampai
              <Input
                type="date"
                value={tableTo}
                onChange={(event) => {
                  setTableTo(event.target.value);
                  setPage(1);
                }}
                className="h-9"
              />
            </label>
          </div>

          {transactions.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Belum ada transaksi"
              description="Catat pemasukan atau pengeluaran manual untuk memulai."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="pb-2 pr-3 font-semibold">Tanggal</th>
                    <th className="px-3 pb-2 font-semibold">Kategori</th>
                    <th className="px-3 pb-2 font-semibold">Catatan</th>
                    <th className="px-3 pb-2 font-semibold">Oleh</th>
                    <th className="px-3 pb-2 text-right font-semibold">Jumlah</th>
                    <th className="pb-2 pl-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const income = row.type === "INCOME";
                    return (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <p className="font-medium text-text-strong">
                            {formatWIB(row.occurredAt, "date")}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatWIB(row.occurredAt, "time")}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <PillBadge variant={income ? "success" : "warning"}>
                              {row.category}
                            </PillBadge>
                            {row.attachKey && <Paperclip className="size-3 text-text-muted" />}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-xs truncate text-text">{row.note ?? "—"}</p>
                          {row.orderCode && (
                            <p className="text-xs text-text-muted">Pesanan {row.orderCode}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-text-muted">
                          {row.createdByName ?? (row.isManual ? "—" : "Sistem")}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3 text-right font-bold tabular-nums",
                            income ? "text-emerald-800" : "text-destructive"
                          )}
                        >
                          {income ? "+" : "-"}
                          {formatRupiah(row.amount)}
                        </td>
                        <td className="py-3 pl-3">
                          <div className="flex items-center justify-end gap-1">
                            {row.isManual ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-8"
                                  title="Ubah"
                                  onClick={() => setDialog({ type: row.type, row })}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-8 text-destructive"
                                  title="Hapus"
                                  disabled={remove.isPending}
                                  onClick={() => {
                                    if (window.confirm("Hapus transaksi manual ini?")) {
                                      remove.mutate(row.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                                {income ? (
                                  <ArrowUpCircle className="size-3.5" />
                                ) : (
                                  <ArrowDownCircle className="size-3.5" />
                                )}
                                otomatis
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Halaman {page} dari {totalPages} · {transactions.data?.total ?? 0} transaksi
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {dialog && (
        <TransactionDialog
          key={dialog.row?.id ?? dialog.type}
          type={dialog.type}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: "green" | "lemon" | "indigo";
}) {
  const tones = {
    green: "border-accent-green/25 bg-accent-green/10 text-emerald-800",
    lemon: "border-accent-orange/25 bg-accent-orange/10 text-accent-orange",
    indigo: "border-primary-200 bg-primary-50 text-primary-800",
  } as const;

  return (
    <div className={cn("rounded-[20px] border p-5 shadow-card", tones[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/70">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{formatRupiah(value)}</p>
    </div>
  );
}

function TransactionDialog({
  type,
  row,
  onClose,
  onSaved,
}: {
  type: "INCOME" | "EXPENSE";
  row?: FinanceTransactionRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categories = type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [category, setCategory] = React.useState(row?.category ?? categories[0]);
  const [amount, setAmount] = React.useState(row ? String(row.amount) : "");
  const [note, setNote] = React.useState(row?.note ?? "");
  const [occurredAt, setOccurredAt] = React.useState(
    row ? row.occurredAt.slice(0, 10) : todayWib()
  );
  const [attachKey, setAttachKey] = React.useState(row?.attachKey ?? "");
  const [fileName, setFileName] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  const save = useMutation({
    mutationFn: (): Promise<unknown> => {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Jumlah harus bilangan bulat lebih dari nol");
      }
      const payload = {
        type,
        category,
        amount: parsed,
        note: note.trim() || undefined,
        occurredAt: `${occurredAt}T12:00:00+07:00`,
        attachKey: attachKey || undefined,
      };
      if (row) {
        return api(`/api/admin/finance/transactions/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            category,
            amount: parsed,
            note: note.trim() || undefined,
            occurredAt: `${occurredAt}T12:00:00+07:00`,
            attachKey: attachKey || undefined,
          }),
        });
      }
      return api("/api/admin/finance/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(row ? "Transaksi diperbarui" : "Transaksi dicatat");
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const prepared = await prepareImageUpload(file, "attachment");
      const res = await fetch("/api/admin/finance/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: prepared.blob.type,
          size: prepared.blob.size,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(json, "Gagal mengunggah lampiran"));
      await putToPresignedUrl(json.data.uploadUrl as string, prepared.blob);
      setAttachKey(json.data.key as string);
      setFileName(file.name);
      toast.success("Lampiran diunggah");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {row ? "Ubah" : "Tambah"} {type === "INCOME" ? "Pemasukan" : "Pengeluaran"}
          </DialogTitle>
          <DialogDescription>
            Transaksi manual dapat diubah atau dihapus. Penjualan otomatis terkunci.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Kategori
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-strong"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Jumlah (Rp)
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="50000"
            />
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Tanggal
            <Input
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Catatan (opsional)
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Contoh: belanja biji kopi"
            />
          </label>

          <div className="space-y-1.5 text-xs font-medium text-text-muted">
            Lampiran (opsional)
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
                className="text-xs"
              />
            </div>
            {uploading && <p className="text-[11px] font-normal">Mengunggah…</p>}
            {!uploading && attachKey && (
              <p className="flex items-center gap-1 text-[11px] font-normal text-text-muted">
                <Paperclip className="size-3" />
                {fileName || "Lampiran tersimpan"}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>
              Batal
            </Button>
            <Button disabled={save.isPending || uploading} onClick={() => save.mutate()}>
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
