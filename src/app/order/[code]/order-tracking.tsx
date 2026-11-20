"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatRupiah } from "@/lib/utils";
import { prepareImageUpload, putToPresignedUrl } from "@/lib/client-image";
import { usePusherChannel, useRealtimeEvent } from "@/lib/pusher-client";
import type { CustomerOrderDTO } from "@/server/services/orders";

const STEPS = [
  { key: "AWAITING_PAYMENT", label: "Menunggu Pembayaran" },
  { key: "AWAITING_VERIFICATION", label: "Menunggu Verifikasi" },
  { key: "ACCEPTED", label: "Diterima" },
  { key: "PREPARING", label: "Diproses" },
  { key: "READY", label: "Siap" },
  { key: "COMPLETED", label: "Selesai" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Menunggu Pembayaran",
  AWAITING_VERIFICATION: "Menunggu Verifikasi",
  PAYMENT_REJECTED: "Bukti Pembayaran Ditolak",
  ACCEPTED: "Diterima",
  PREPARING: "Diproses",
  READY: "Siap",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

function statusIndex(status: CustomerOrderDTO["status"]): number {
  if (status === "PAYMENT_REJECTED") return 0;
  const index = STEPS.findIndex((step) => step.key === status);
  return index === -1 ? 0 : index;
}

async function fetchOrder(code: string): Promise<CustomerOrderDTO> {
  const res = await fetch(`/api/public/orders/${code}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(apiErrorMessage(json, "Gagal memuat pesanan"));
  }
  return json as CustomerOrderDTO;
}

export function OrderTracking({ initial }: { initial: CustomerOrderDTO }) {
  const { code } = initial;
  const queryClient = useQueryClient();
  const queryKey = ["customer-order", code];

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchOrder(code),
    initialData: initial,
    refetchInterval: 30_000,
  });

  const channel = CHANNELS.order(code);
  usePusherChannel(channel);

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["customer-order", code] });
  }, [queryClient, code]);

  useRealtimeEvent(channel, REALTIME_EVENTS.orderStatusChanged, (payload) => {
    const status = (payload as { status?: string } | null)?.status;
    if (status) toast.info(`Status pesanan: ${STATUS_LABEL[status] ?? status}`);
    refresh();
  });
  useRealtimeEvent(channel, REALTIME_EVENTS.paymentUploaded, refresh);

  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = Math.max(0, new Date(data.expiresAt).getTime() - (now ?? 0));
  const timeExpired = now !== null && remainingMs <= 0;
  const attemptsLeft = Math.max(0, data.maxAttempts - data.attemptsUsed);
  const attemptsExhausted = data.attemptsUsed >= data.maxAttempts;
  const dead =
    data.status === "CANCELLED" ||
    ((data.status === "AWAITING_PAYMENT" || data.status === "PAYMENT_REJECTED") &&
      (data.isExpired || timeExpired || attemptsExhausted));

  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploaderKey, setUploaderKey] = React.useState(0);
  const [cancelling, setCancelling] = React.useState(false);

  async function submitProof() {
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareImageUpload(file, "proof");

      const presignRes = await fetch(
        `/api/public/orders/${code}/payment/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: prepared.blob.type,
            size: prepared.blob.size,
          }),
        }
      );
      const presignJson = await presignRes.json();
      if (!presignRes.ok) {
        toast.error(apiErrorMessage(presignJson, "Gagal menyiapkan unggahan"));
        return;
      }

      await putToPresignedUrl(presignJson.data.uploadUrl as string, prepared.blob);

      const res = await fetch(`/api/public/orders/${code}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: presignJson.data.key }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(apiErrorMessage(json, "Gagal mengunggah bukti pembayaran"));
        return;
      }

      toast.success("Bukti pembayaran terkirim. Menunggu verifikasi kasir.");
      setFile(null);
      setUploaderKey((value) => value + 1);
      await refresh();
    } catch {
      toast.error("Gagal mengunggah bukti pembayaran");
    } finally {
      setUploading(false);
    }
  }

  async function cancelOrder() {
    if (!window.confirm("Batalkan pesanan ini? Stok akan dikembalikan.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/public/orders/${code}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(apiErrorMessage(json, "Gagal membatalkan pesanan"));
        return;
      }
      toast.success("Pesanan dibatalkan");
      await refresh();
    } catch {
      toast.error("Gagal membatalkan pesanan");
    } finally {
      setCancelling(false);
    }
  }

  const showPaySection =
    data.status === "AWAITING_PAYMENT" || data.status === "PAYMENT_REJECTED";

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {data.cafeName} · {data.tableName}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-text-strong sm:text-3xl">
              {data.code}
            </p>
          </div>
          <Badge
            variant={dead ? "outline" : "default"}
            className={cn(
              "px-3 py-1 text-xs",
              data.status === "CANCELLED" && "border-destructive/30 text-destructive",
              data.status === "COMPLETED" &&
                "bg-accent-green/15 text-emerald-700 border-emerald-200"
            )}
          >
            {STATUS_LABEL[data.status] ?? data.status}
          </Badge>
          <p className="sr-only" role="status" aria-live="polite">
            Status pesanan: {STATUS_LABEL[data.status] ?? data.status}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {STEPS.map((step, index) => {
            const current = statusIndex(data.status);
            const done = !dead && index < current;
            const active = !dead && index === current;

            return (
              <div key={step.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                    done && "border-primary bg-primary text-white",
                    active &&
                      "border-primary bg-primary-50 text-primary-700 ring-2 ring-primary/20",
                    !done && !active && "border-border bg-surface-muted text-text-muted"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    active && "font-semibold text-text-strong",
                    done && "text-text-strong",
                    !done && !active && "text-text-muted"
                  )}
                >
                  {step.label}
                </span>
                {active && data.status === "AWAITING_VERIFICATION" && (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                )}
              </div>
            );
          })}
        </div>

        {data.status === "CANCELLED" && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <XCircle className="size-4 shrink-0" />
            Pesanan dibatalkan. Silakan buat pesanan baru bila masih ingin memesan.
          </div>
        )}
      </div>

      {showPaySection && !dead && (
        <div className="rounded-[20px] border border-border bg-surface p-6 shadow-card">
          <h2 className="text-base font-bold text-text-strong">
            Selesaikan Pembayaran
          </h2>

          {data.status === "PAYMENT_REJECTED" && (
            <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-destructive">
                <XCircle className="size-4" /> Bukti pembayaran ditolak
              </p>
              {data.latestPayment?.rejectReason && (
                <p className="mt-1 text-text">
                  Alasan: {data.latestPayment.rejectReason}
                </p>
              )}
              <p className="mt-1 text-xs text-text-muted">
                Sisa kesempatan unggah: {attemptsLeft}
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
            <div>
              <p className="text-xs text-text-muted">Total tagihan</p>
              <p className="text-xl font-bold text-primary-800">
                {formatRupiah(data.total)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Sisa waktu</p>
              <p
                className={cn(
                  "font-mono text-xl font-bold tabular-nums",
                  remainingMs < 60_000 ? "text-destructive" : "text-text-strong"
                )}
              >
                {now === null ? "--:--" : formatCountdown(remainingMs)}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {data.paymentMethods.map((method) => (
              <div
                key={method.id}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-text-strong">
                  {method.kind === "QRIS" ? (
                    <QrCode className="size-4 text-primary" />
                  ) : (
                    <Copy className="size-4 text-primary" />
                  )}
                  {method.label}
                </div>

                {method.kind === "QRIS" && method.imageUrl && (
                  <div className="mt-3 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- QRIS dari R2 publik */}
                    <img
                      src={method.imageUrl}
                      alt={`QRIS ${method.label}`}
                      className="size-48 rounded-xl border border-border object-contain"
                    />
                  </div>
                )}

                {method.kind === "BANK" && method.accountNo && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-text-strong">
                        {method.accountNo}
                      </p>
                      <p className="text-xs text-text-muted">
                        a.n. {method.accountName ?? "-"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label="Salin nomor rekening"
                      onClick={() => copyText(method.accountNo!)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-border/60 pt-5">
            <ProofUploader
              key={uploaderKey}
              disabled={uploading}
              onSelect={setFile}
            />

            <Button
              type="button"
              className="mt-4 h-11 w-full"
              disabled={!file || uploading}
              onClick={submitProof}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Mengunggah...
                </>
              ) : (
                "Kirim Bukti Pembayaran"
              )}
            </Button>

            {attemptsLeft > 0 && data.status === "PAYMENT_REJECTED" && (
              <p className="mt-2 text-center text-xs text-text-muted">
                Sisa kesempatan unggah ulang: {attemptsLeft}
              </p>
            )}
          </div>

          {data.canCancel && !timeExpired && (
            <Button
              type="button"
              variant="ghost"
              className="mt-3 h-11 w-full text-destructive hover:bg-destructive/10"
              disabled={cancelling}
              onClick={cancelOrder}
            >
              {cancelling ? "Membatalkan..." : "Batalkan pesanan"}
            </Button>
          )}
        </div>
      )}

      {data.status === "AWAITING_VERIFICATION" && (
        <div className="rounded-[20px] border border-primary-200 bg-primary-50 p-6 text-center shadow-card">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-3 text-base font-bold text-primary-800">
            Menunggu verifikasi kasir
          </p>
          <p className="mt-1 text-sm text-text">
            Bukti pembayaran Anda sedang diperiksa. Halaman ini akan berubah
            otomatis tanpa perlu refresh.
          </p>
        </div>
      )}

      {dead && data.status !== "CANCELLED" && (
        <div className="rounded-[20px] border border-destructive/20 bg-destructive/5 p-6 text-center shadow-card">
          <XCircle className="mx-auto size-8 text-destructive" />
          <p className="mt-3 text-base font-bold text-destructive">
            Pesanan dibatalkan
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {attemptsExhausted
              ? "Batas unggah ulang bukti pembayaran telah tercapai."
              : "Waktu pembayaran telah habis."}
          </p>
        </div>
      )}

      {!showPaySection && data.status !== "AWAITING_VERIFICATION" && !dead && (
        <div className="rounded-[20px] border border-accent-green/30 bg-accent-green/10 p-5 text-center shadow-card">
          <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
          <p className="mt-2 text-sm font-semibold text-emerald-800">
            Pembayaran terverifikasi. Pesanan Anda sedang kami siapkan.
          </p>
        </div>
      )}

      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-card">
        <h2 className="text-base font-bold text-text-strong">Ringkasan Pesanan</h2>

        <ul className="mt-4 divide-y divide-border/60">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-text-strong">
                  {item.quantity}× {item.name}
                </p>
                {item.note && (
                  <p className="text-xs text-text-muted">Catatan: {item.note}</p>
                )}
              </div>
              <p className="whitespace-nowrap text-sm text-text">
                {formatRupiah(item.price * item.quantity)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
          <span className="text-text-muted">Subtotal</span>
          <span className="text-text">{formatRupiah(data.subtotal)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-base font-bold">
          <span className="text-text-strong">Total</span>
          <span className="text-primary-800">{formatRupiah(data.total)}</span>
        </div>

        {data.note && (
          <p className="mt-4 rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
            Catatan pesanan: {data.note}
          </p>
        )}
      </div>
    </div>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Nomor berhasil disalin");
  } catch {
    toast.error("Gagal menyalin nomor");
  }
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function ProofUploader({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;

    const extensionOk = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!ALLOWED_TYPES.includes(file.type) && !extensionOk) {
      setError("Format harus JPG, PNG, atau WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 10 MB.");
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onSelect(file);
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {preview ? (
        <div className="relative flex items-center justify-center rounded-xl border border-border bg-surface-muted p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
          <img
            src={preview}
            alt="Pratinjau bukti pembayaran"
            className="max-h-56 w-auto rounded-lg object-contain"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute right-2 top-2 size-11"
            onClick={clear}
            disabled={disabled}
            aria-label="Hapus gambar bukti"
          >
            <XCircle className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-muted/60 px-4 py-8 text-center transition-colors hover:border-primary-400 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadCloud className="size-7 text-primary" />
          <span className="text-sm font-semibold text-text-strong">
            Unggah bukti pembayaran
          </span>
          <span className="text-xs text-text-muted">
            JPG, PNG, atau WEBP · Maks. 10 MB
          </span>
        </button>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      )}
    </div>
  );
}
