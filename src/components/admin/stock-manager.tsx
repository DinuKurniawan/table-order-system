"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  History,
  Minus,
  PackageX,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillBadge } from "@/components/admin/pill-badge";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatWIB, relativeTime } from "@/lib/utils";
import { useRealtimeEvent } from "@/lib/pusher-client";
import type {
  StockMovementRow,
  StockOverview,
  StockProductRow,
} from "@/server/services/stock";

type Filter = "all" | "low" | "out";
type AdjustType = "PURCHASE" | "ADJUSTMENT" | "WASTE";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "low", label: "Menipis" },
  { key: "out", label: "Habis" },
];

const TYPE_LABEL: Record<AdjustType, string> = {
  PURCHASE: "Barang Masuk",
  ADJUSTMENT: "Koreksi",
  WASTE: "Waste",
};

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: "Barang masuk",
  ADJUSTMENT: "Koreksi",
  WASTE: "Waste",
  ORDER_RESERVE: "Reservasi pesanan",
  ORDER_RELEASE: "Pelepasan pesanan",
};

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

function statusPill(row: StockProductRow) {
  if (!row.trackStock) return <PillBadge variant="neutral">Tidak dilacak</PillBadge>;
  if (row.status === "habis") return <PillBadge variant="danger">Habis</PillBadge>;
  if (row.status === "menipis") return <PillBadge variant="warning">Menipis</PillBadge>;
  return <PillBadge variant="success">Aman</PillBadge>;
}

export function StockManager() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<{
    type: AdjustType;
    productId?: string;
  } | null>(null);
  const [history, setHistory] = React.useState<StockProductRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stock"],
    queryFn: () => api<StockOverview>("/api/admin/stock"),
  });

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["menu"] });
  }, [queryClient]);

  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.stockChanged, refresh);
  useRealtimeEvent(CHANNELS.admin, REALTIME_EVENTS.stockLow, (payload) => {
    const name = (payload as { name?: string } | null)?.name;
    toast.warning(name ? `Stok menipis: ${name}` : "Ada stok menipis");
    refresh();
  });

  const adjust = useMutation({
    mutationFn: (payload: {
      productId: string;
      type: AdjustType;
      quantity: number;
      note?: string;
    }) => api("/api/admin/stock/adjust", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Stok diperbarui");
      setDialog(null);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Gagal memperbarui stok"),
  });

  const settings = useMutation({
    mutationFn: (payload: {
      productId: string;
      lowStockThreshold?: number;
      trackStock?: boolean;
    }) =>
      api(`/api/admin/stock/${payload.productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(payload.lowStockThreshold !== undefined
            ? { lowStockThreshold: payload.lowStockThreshold }
            : {}),
          ...(payload.trackStock !== undefined ? { trackStock: payload.trackStock } : {}),
        }),
      }),
    onSuccess: () => {
      toast.success("Pengaturan stok disimpan");
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  const products = data?.products ?? [];
  const counts = data?.counts ?? { all: 0, low: 0, out: 0 };
  const query = search.trim().toLowerCase();
  const visible = products.filter((row) => {
    if (filter === "low" && row.status !== "menipis") return false;
    if (filter === "out" && row.status !== "habis") return false;
    if (!query) return true;
    return (
      row.name.toLowerCase().includes(query) || row.category.toLowerCase().includes(query)
    );
  });

  const lowTotal = counts.low + counts.out;

  return (
    <div className="space-y-5">
      {lowTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-accent-orange/30 bg-accent-orange/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-text-strong">
            <AlertTriangle className="size-4 text-accent-orange" />
            {counts.out > 0
              ? `${counts.out} produk habis dan ${counts.low} menipis.`
              : `${counts.low} produk menipis di bawah batas minimum.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setFilter("low")}
          >
            Lihat stok menipis
          </Button>
        </div>
      )}

      <SectionCard
        title="Manajemen & Riwayat Stok"
        subtitle="Pantau sisa stok, atur batas minimum, dan catat mutasi barang."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={() => setDialog({ type: "ADJUSTMENT" })}
            >
              <SlidersHorizontal className="size-3.5" />
              Koreksi
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={() => setDialog({ type: "PURCHASE" })}
            >
              <Plus className="size-4" />
              Barang Masuk
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => {
                const count =
                  item.key === "all"
                    ? counts.all
                    : item.key === "low"
                    ? counts.low
                    : counts.out;
                return (
                  <button key={item.key} type="button" onClick={() => setFilter(item.key)}>
                    <PillBadge
                      variant={
                        filter === item.key
                          ? item.key === "out"
                            ? "danger"
                            : item.key === "low"
                            ? "warning"
                            : "primary"
                          : "neutral"
                      }
                    >
                      {item.label} ({count})
                    </PillBadge>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari produk atau kategori..."
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl border border-border bg-surface-muted/60"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={PackageX}
              title="Tidak ada produk"
              description="Ubah filter atau kata kunci pencarian."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="pb-2 pr-3 font-semibold">Produk</th>
                    <th className="px-3 pb-2 font-semibold">Stok</th>
                    <th className="px-3 pb-2 font-semibold">Minimum</th>
                    <th className="px-3 pb-2 font-semibold">Status</th>
                    <th className="px-3 pb-2 font-semibold">Lacak</th>
                    <th className="pb-2 pl-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-text-strong">{row.name}</p>
                        <p className="text-xs text-text-muted">
                          {row.category}
                          {!row.isActive ? " · Nonaktif" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "text-base font-bold tabular-nums",
                            row.trackStock
                              ? row.stock <= 0
                                ? "text-destructive"
                                : row.stock <= row.lowStockThreshold
                                ? "text-accent-orange"
                                : "text-text-strong"
                              : "text-text-muted"
                          )}
                        >
                          {row.trackStock ? row.stock : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <ThresholdInput
                          key={`${row.id}-${row.lowStockThreshold}`}
                          value={row.lowStockThreshold}
                          disabled={!row.trackStock || settings.isPending}
                          onCommit={(value) =>
                            value !== row.lowStockThreshold &&
                            settings.mutate({ productId: row.id, lowStockThreshold: value })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">{statusPill(row)}</td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={row.trackStock}
                          disabled={settings.isPending}
                          onCheckedChange={(checked) =>
                            settings.mutate({ productId: row.id, trackStock: checked })
                          }
                          aria-label={`Lacak stok ${row.name}`}
                        />
                      </td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!row.trackStock || adjust.isPending}
                            title="Tambah 1 stok"
                            onClick={() =>
                              adjust.mutate({
                                productId: row.id,
                                type: "ADJUSTMENT",
                                quantity: 1,
                                note: "Penyesuaian cepat",
                              })
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!row.trackStock || adjust.isPending || row.stock <= 0}
                            title="Kurangi 1 stok"
                            onClick={() =>
                              adjust.mutate({
                                productId: row.id,
                                type: "ADJUSTMENT",
                                quantity: -1,
                                note: "Penyesuaian cepat",
                              })
                            }
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            title="Riwayat pergerakan"
                            onClick={() => setHistory(row)}
                          >
                            <History className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {dialog && (
        <AdjustDialog
          key={`${dialog.type}-${dialog.productId ?? "pilih"}`}
          type={dialog.type}
          products={products}
          initialProductId={dialog.productId}
          pending={adjust.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(payload) => adjust.mutate(payload)}
        />
      )}

      <StockHistorySheet
        product={history}
        onClose={() => setHistory(null)}
      />
    </div>
  );
}

function ThresholdInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));

  return (
    <Input
      type="number"
      min={0}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = Math.max(0, Math.floor(Number(draft)));
        if (!Number.isFinite(parsed)) {
          setDraft(String(value));
          return;
        }
        setDraft(String(parsed));
        onCommit(parsed);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="h-9 w-20 text-sm"
    />
  );
}

function AdjustDialog({
  type,
  products,
  initialProductId,
  pending,
  onClose,
  onSubmit,
}: {
  type: AdjustType;
  products: StockProductRow[];
  initialProductId?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    productId: string;
    type: AdjustType;
    quantity: number;
    note?: string;
  }) => void;
}) {
  const [mode, setMode] = React.useState<AdjustType>(type);
  const [productId, setProductId] = React.useState(
    initialProductId ?? products.find((row) => row.trackStock)?.id ?? products[0]?.id ?? ""
  );
  const [quantity, setQuantity] = React.useState("1");
  const [note, setNote] = React.useState("");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Sesuaikan Stok</DialogTitle>
          <DialogDescription>
            Catat barang masuk, koreksi, atau waste. Saldo akhir tersimpan di riwayat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
            {(["PURCHASE", "ADJUSTMENT", "WASTE"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={cn(
                  "rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                  mode === item
                    ? "bg-surface text-text-strong shadow-sm"
                    : "text-text-muted hover:text-text-strong"
                )}
              >
                {TYPE_LABEL[item]}
              </button>
            ))}
          </div>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Produk
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-strong outline-none focus:border-primary"
            >
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — stok {row.trackStock ? row.stock : "tidak dilacak"}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            {mode === "ADJUSTMENT" ? "Jumlah (+/-)" : "Jumlah"}
            <Input
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              min={mode === "ADJUSTMENT" ? undefined : 1}
            />
            <span className="block text-[11px] font-normal text-text-muted">
              {mode === "PURCHASE"
                ? "Menambah stok."
                : mode === "WASTE"
                ? "Mengurangi stok karena rusak/terbuang."
                : "Gunakan nilai negatif untuk mengurangi stok."}
            </span>
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-text-muted">
            Catatan (opsional)
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              placeholder="Contoh: pembelian dari supplier"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button
              disabled={pending || !productId}
              onClick={() => {
                const parsed = Number(quantity);
                if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed === 0) {
                  toast.error("Jumlah harus bilangan bulat dan tidak nol");
                  return;
                }
                if (mode !== "ADJUSTMENT" && parsed < 0) {
                  toast.error("Jumlah harus positif");
                  return;
                }
                onSubmit({
                  productId,
                  type: mode,
                  quantity: parsed,
                  note: note.trim() || undefined,
                });
              }}
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StockHistorySheet({
  product,
  onClose,
}: {
  product: StockProductRow | null;
  onClose: () => void;
}) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", `${from}T00:00:00`);
  if (to) params.set("to", `${to}T23:59:59`);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-history", product?.id, from, to],
    queryFn: () =>
      api<StockMovementRow[]>(
        `/api/admin/stock/${product?.id}/movements?${params.toString()}`
      ),
    enabled: Boolean(product),
  });

  const rows = data ?? [];

  const exportCsv = () => {
    if (!product || rows.length === 0) return;
    const header = ["Tanggal", "Jenis", "Qty", "Saldo", "Catatan", "Pengguna", "Pesanan"];
    const body = rows.map((row) => [
      formatWIB(row.createdAt),
      MOVEMENT_LABEL[row.type] ?? row.type,
      row.quantity,
      row.balance,
      row.note ?? "",
      row.userName ?? "",
      row.orderCode ?? "",
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
    anchor.download = `riwayat-stok-${product.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={Boolean(product)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Riwayat Pergerakan</SheetTitle>
          <SheetDescription>
            {product ? `${product.name} · ${product.category}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-text-muted">
            Dari
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-text-muted">
            Sampai
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            disabled={rows.length === 0}
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            Ekspor CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada pergerakan"
            description="Riwayat akan muncul setelah ada penyesuaian atau pesanan."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const inbound = row.quantity > 0;
              return (
                <li key={row.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {inbound ? (
                        <ArrowUpCircle className="mt-0.5 size-4 text-accent-green" />
                      ) : (
                        <ArrowDownCircle className="mt-0.5 size-4 text-destructive" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-text-strong">
                          {MOVEMENT_LABEL[row.type] ?? row.type}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatWIB(row.createdAt)} · {relativeTime(row.createdAt)}
                        </p>
                        {row.note && (
                          <p className="mt-1 text-xs text-text-muted">{row.note}</p>
                        )}
                        <p className="mt-1 text-[11px] text-text-muted">
                          {row.userName ? `Oleh ${row.userName}` : "Sistem"}
                          {row.orderCode && row.orderId ? (
                            <>
                              {" · Pesanan "}
                              <Link
                                href={`/cashier/orders/${row.orderId}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {row.orderCode}
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          inbound ? "text-accent-green" : "text-destructive"
                        )}
                      >
                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                      </p>
                      <p className="text-[11px] text-text-muted">Saldo {row.balance}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
