"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  PackageSearch,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TrackedOrder {
  code: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface TrackQuery {
  name: string;
  table: string;
}

interface Notice {
  title: string;
  message: string;
}

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Menunggu Pembayaran",
  AWAITING_VERIFICATION: "Menunggu Verifikasi",
  PAYMENT_REJECTED: "Pembayaran Ditolak",
  ACCEPTED: "Diterima",
  PREPARING: "Diproses",
  READY: "Siap",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

function statusClassName(status: string): string {
  if (status === "CANCELLED" || status === "PAYMENT_REJECTED") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (status === "READY" || status === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "AWAITING_VERIFICATION") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-primary/20 bg-primary-50 text-primary-700";
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TrackForm({
  tables,
  tableToken,
  lockedTable,
}: {
  tables: string[];
  tableToken: string | null;
  lockedTable: string | null;
}) {
  const [name, setName] = React.useState("");
  const [table, setTable] = React.useState(lockedTable ?? "");
  const [query, setQuery] = React.useState<TrackQuery | null>(null);
  const [orders, setOrders] = React.useState<TrackedOrder[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const runTrack = React.useCallback(
    async (input: TrackQuery, silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const res = await fetch("/api/public/orders/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, tableToken }),
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          if (!silent) {
            if (res.status === 403) {
              setNotice({
                title: "Akses ditolak",
                message: apiErrorMessage(
                  json,
                  "Meja tidak sesuai dengan barcode meja Anda."
                ),
              });
            } else {
              setError(apiErrorMessage(json, "Gagal melacak pesanan."));
            }
          }
          return;
        }

        setOrders((json as { orders: TrackedOrder[] }).orders ?? []);
      } catch {
        if (!silent) setError("Terjadi kesalahan. Coba lagi.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tableToken]
  );

  // Status berubah dari sisi kasir; segarkan hasil tanpa interaksi.
  React.useEffect(() => {
    if (!query) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void runTrack(query, true);
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [query, runTrack]);

  function closeNotice() {
    setNotice(null);
    if (lockedTable) setTable(lockedTable);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Nama pemesan minimal 2 karakter.");
      return;
    }

    // Meja wajib berasal dari barcode; jangan pernah menuruti pilihan manual
    // yang berbeda. Ini menjaga agar pesanan meja lain tidak bisa dilacak.
    if (!tableToken || !lockedTable) {
      setNotice({
        title: "Akses meja diperlukan",
        message:
          "Buka halaman ini lewat tombol Lacak Pesanan di menu meja Anda. Scan QR di meja terlebih dahulu.",
      });
      return;
    }

    if (table.toLowerCase() !== lockedTable.toLowerCase()) {
      setNotice({
        title: "Meja tidak sesuai",
        message: `Barcode meja Anda adalah ${lockedTable}. Pilih meja tersebut untuk melanjutkan.`,
      });
      return;
    }

    const next = { name: trimmed, table: lockedTable };
    setQuery(next);
    setOrders(null);
    void runTrack(next, false);
  }

  if (!tableToken || !lockedTable) {
    return (
      <section className="rounded-[20px] border border-border bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-text-strong">
          Akses lewat barcode meja
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Halaman lacak hanya bisa dibuka dari tombol Lacak Pesanan di menu
          meja. Scan QR di meja Anda, lalu pilih Lacak Pesanan dari menu.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[20px] border border-border bg-surface p-6 shadow-card sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <PackageSearch className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-text-strong">
          Lacak Pesanan
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Masukkan nama pemesan untuk melihat status pesanan di {lockedTable}{" "}
          dalam 24 jam terakhir.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="track-name"
              className="text-sm font-medium text-text-strong"
            >
              Nama pemesan
            </label>
            <Input
              id="track-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama yang dipakai saat memesan"
              autoComplete="name"
              maxLength={80}
              className="h-11 rounded-xl"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="track-table"
              className="text-sm font-medium text-text-strong"
            >
              Nomor meja
            </label>
            <Select
              value={table}
              onValueChange={(value) => setTable(value ?? "")}
              disabled={loading}
            >
              <SelectTrigger
                id="track-table"
                aria-label="Nomor meja"
                className="h-11 w-full rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tables.map((tableName) => (
                  <SelectItem key={tableName} value={tableName}>
                    {tableName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">
              Meja dari barcode:{" "}
              <span className="font-semibold text-text-strong">
                {lockedTable}
              </span>
              . Pesanan hanya bisa dilacak dari meja ini.
            </p>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertCircle className="size-3.5 shrink-0" /> {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Mencari...
              </>
            ) : (
              "Lacak Pesanan"
            )}
          </Button>
        </form>
      </section>

      {loading && (
        <section className="flex items-center justify-center gap-2 rounded-[20px] border border-border bg-surface p-6 text-sm text-text-muted shadow-card">
          <Loader2 className="size-4 animate-spin" /> Memuat pesanan...
        </section>
      )}

      {!loading && orders !== null && orders.length === 0 && (
        <section className="rounded-[20px] border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-sm font-semibold text-text-strong">
            Pesanan tidak ditemukan
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Pastikan nama pemesan dan nomor meja sama dengan saat memesan.
            Pelacakan hanya tersedia untuk 24 jam terakhir.
          </p>
        </section>
      )}

      {!loading && orders && orders.length > 0 && (
        <section className="rounded-[20px] border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-text-strong">
              Hasil Pelacakan
            </h2>
            <span className="text-xs text-text-muted">
              {orders.length} pesanan
            </span>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {orders.length} pesanan ditemukan.
          </p>

          <ul className="mt-4 space-y-3">
            {orders.map((order) => (
              <li
                key={order.code}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold tracking-wider text-text-strong">
                      {order.code}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {dateFormatter.format(new Date(order.createdAt))}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-2.5 py-1 text-xs",
                      statusClassName(order.status)
                    )}
                  >
                    {STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                </div>

                <Link
                  href={`/order/${order.code}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                >
                  Buka detail pesanan <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-text-muted">
        Halaman ini hanya menampilkan status pesanan. Untuk pembayaran atau
        detail lengkap, buka kode akses pesanan yang Anda terima.
      </p>

      <Dialog
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) closeNotice();
        }}
      >
        <DialogContent showCloseButton={false} className="rounded-2xl">
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>{notice?.title}</DialogTitle>
            <DialogDescription>{notice?.message}</DialogDescription>
          </DialogHeader>
          <Button type="button" className="h-11 w-full" onClick={closeNotice}>
            Mengerti
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
