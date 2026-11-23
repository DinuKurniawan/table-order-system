"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CookingPot,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatRupiah, formatWIB, relativeTime } from "@/lib/utils";
import { useRealtimeEvent } from "@/lib/pusher-client";
import type {
  CashierOrderDetail as OrderDetail,
  ProgressStatus,
} from "@/server/services/cashier-orders";

// Viewer zoom (pan/zoom/fullscreen) berat dan jarang dipakai: muat saat dibutuhkan.
const ProofViewer = dynamic(
  () => import("./proof-viewer").then((mod) => mod.ProofViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[380px] animate-pulse rounded-xl bg-surface-muted/60" />
    ),
  }
);

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Menunggu pembayaran",
  AWAITING_VERIFICATION: "Menunggu verifikasi",
  PAYMENT_REJECTED: "Pembayaran ditolak",
  ACCEPTED: "Diterima",
  PREPARING: "Diproses",
  READY: "Siap",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

const NEXT_ACTION: Partial<
  Record<string, { next: ProgressStatus; label: string; icon: React.ElementType }>
> = {
  ACCEPTED: { next: "PREPARING", label: "Mulai Proses", icon: CookingPot },
  PREPARING: { next: "READY", label: "Tandai Siap", icon: CheckCircle2 },
  READY: { next: "COMPLETED", label: "Selesaikan", icon: Check },
};

const REJECT_PRESETS = [
  "Nominal tidak sesuai",
  "Bukti tidak jelas/buram",
  "Bukan bukti pembayaran",
  "Pembayaran belum masuk",
];

async function fetchDetail(id: string): Promise<OrderDetail> {
  const res = await fetch(`/api/cashier/orders/${id}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, "Gagal memuat pesanan"));
  return json.data as OrderDetail;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, "Permintaan gagal"));
  return json.data;
}

export function CashierOrderDetail({ initial }: { initial: OrderDetail }) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [autoPrint, setAutoPrint] = React.useState(true);

  const { data } = useQuery({
    queryKey: ["cashier-order", initial.id],
    queryFn: () => fetchDetail(initial.id),
    initialData: initial,
    refetchInterval: 20_000,
  });

  const order = data ?? initial;
  const pendingPayment = order.payments.find((p) => p.status === "PENDING");
  const printUrl = `/cashier/orders/${order.id}/print?w=58`;

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cashier-order", initial.id] });
    queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
  }, [queryClient, initial.id]);

  useRealtimeEvent(CHANNELS.cashier, REALTIME_EVENTS.orderStatusChanged, refresh);
  useRealtimeEvent(CHANNELS.cashier, REALTIME_EVENTS.paymentUploaded, refresh);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setPending(key);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Permintaan gagal");
    } finally {
      setPending(null);
    }
  };

  const approve = () =>
    run(
      "approve",
      async () => {
        await postJson(`/api/cashier/orders/${order.id}/approve`);
        if (autoPrint) window.open(printUrl, "_blank", "noopener");
      },
      "Pembayaran disetujui"
    );

  const reject = async () => {
    const clean = reason.trim();
    if (!clean) {
      toast.error("Alasan penolakan wajib diisi");
      return;
    }
    await run(
      "reject",
      async () => {
        await postJson(`/api/cashier/orders/${order.id}/reject`, { reason: clean });
        setRejectOpen(false);
        setReason("");
      },
      "Pembayaran ditolak"
    );
  };

  const advance = (next: ProgressStatus, label: string) =>
    run(
      `status-${next}`,
      () => postJson(`/api/cashier/orders/${order.id}/status`, { status: next }),
      label
    );

  const action = NEXT_ACTION[order.status];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="size-11 rounded-xl">
            <Link href="/cashier" aria-label="Kembali ke antrean">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl font-bold tracking-wide text-text-strong">
                {order.code}
              </h2>
              <Badge className="bg-primary-50 text-primary-800">{STATUS_LABEL[order.status]}</Badge>
            </div>
            <p className="text-sm text-text-muted">
              {order.tableName} · {formatWIB(order.createdAt)} · {relativeTime(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {order.status !== "AWAITING_VERIFICATION" && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={printUrl} target="_blank">
                <Printer className="size-4" />
                {order.printCount > 0 ? "Cetak Ulang" : "Cetak"}
              </Link>
            </Button>
          )}
          {action && (
            <Button
              className="gap-1.5"
              disabled={pending !== null}
              onClick={() => advance(action.next, action.label)}
            >
              <action.icon className="size-4" />
              {action.label}
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="space-y-5">
          <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-strong">Item Pesanan</h3>
              {order.customerName && (
                <p className="text-xs text-text-muted">Pelanggan: {order.customerName}</p>
              )}
            </div>
            <ul className="mt-4 divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-text-strong">
                      {item.quantity}× {item.name}
                    </p>
                    {item.note && (
                      <p className="mt-1 rounded-lg bg-accent-orange/10 px-2 py-1 text-xs font-bold uppercase tracking-wide text-accent-orange">
                        {item.note.toUpperCase()}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums text-text">
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
            {order.note && (
              <div className="mt-3 rounded-xl bg-surface-muted p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Catatan Pesanan
                </p>
                <p className="mt-1 text-sm font-medium uppercase text-text-strong">
                  {order.note.toUpperCase()}
                </p>
              </div>
            )}
            {order.discount > 0 && (
              <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Subtotal</span>
                  <span className="tabular-nums text-text">
                    {formatRupiah(order.subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">
                    Diskon
                    {order.voucherCode ? ` (${order.voucherCode})` : ""}
                  </span>
                  <span className="tabular-nums text-primary-700">
                    -{formatRupiah(order.discount)}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold text-text-muted">Total</span>
              <span className="text-2xl font-bold text-primary-800">
                {formatRupiah(order.total)}
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
            <h3 className="text-sm font-semibold text-text-strong">Riwayat Pembayaran</h3>
            {order.payments.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Belum ada bukti pembayaran.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {order.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-text-strong">
                        Percobaan {payment.attempt}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatWIB(payment.createdAt)}
                        {payment.verifiedByName ? ` · ${payment.verifiedByName}` : ""}
                      </p>
                      {payment.rejectReason && (
                        <p className="mt-1 text-xs text-destructive">{payment.rejectReason}</p>
                      )}
                    </div>
                    <Badge
                      className={cn(
                        "text-[11px]",
                        payment.status === "PENDING" &&
                          "bg-accent-orange/15 text-accent-orange",
                        payment.status === "APPROVED" &&
                          "bg-accent-green/15 text-emerald-700",
                        payment.status === "REJECTED" &&
                          "bg-destructive/10 text-destructive"
                      )}
                    >
                      {payment.status === "PENDING"
                        ? "Menunggu"
                        : payment.status === "APPROVED"
                        ? "Disetujui"
                        : "Ditolak"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {pendingPayment ? (
            <>
              <ProofViewer orderId={order.id} paymentId={pendingPayment.id} />
              <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
                <label className="mb-3 flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={autoPrint}
                    onChange={(event) => setAutoPrint(event.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  Buka dialog cetak setelah menyetujui
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="h-12 gap-1.5 text-sm"
                    disabled={pending !== null}
                    onClick={approve}
                  >
                    <Check className="size-4" />
                    {pending === "approve" ? "Memproses..." : "Setuju"}
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-12 gap-1.5 text-sm"
                    disabled={pending !== null}
                    onClick={() => setRejectOpen(true)}
                  >
                    <X className="size-4" />
                    Tolak
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[20px] border border-dashed border-border bg-surface-muted/50 p-6 text-center">
              <p className="text-sm font-semibold text-text-strong">
                Tidak ada bukti menunggu verifikasi
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Status pesanan: {STATUS_LABEL[order.status]}
              </p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tolak Bukti Pembayaran</DialogTitle>
            <DialogDescription>
              Pilih alasan penolakan. Alasan akan tampil di halaman pelacakan customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              {REJECT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors",
                    reason === preset
                      ? "border-destructive bg-destructive/5 text-destructive"
                      : "border-border text-text hover:bg-surface-muted"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Lainnya / alasan bebas..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11" onClick={() => setRejectOpen(false)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                className="h-11"
                disabled={pending !== null}
                onClick={reject}
              >
                Tolak Pembayaran
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
